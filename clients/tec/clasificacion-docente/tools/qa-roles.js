// Qué datos tiene cada usuario de prueba en la BD de QA, para saber con qué rol y qué
// postulaciones sirve en las pruebas de clarificación (HU 1). Solo SELECT.
//
// Se corre dentro de la app CAP (usa su conexión a HANA):
//   cf target -o "Instituto Tecnológico y de Estudios Superiores de Monterrey_sap-hana-cloud-qa-ni4j59ls" -s hana_cloud_qa
//   cf ssh perfilunico-srv -c "cat > /tmp/qa-roles.js && cd /home/vcap/app && NODE_PATH=node_modules /home/vcap/deps/0/bin/node /tmp/qa-roles.js 2>/dev/null | grep -v '^\[cds\]'" < clients/tec/clasificacion-docente/tools/qa-roles.js
const cds = require('@sap/cds');

// Nóminas en formato canónico de la BD (>= 3.500.000 sin ceros; si no, 8 dígitos).
const USUARIOS = {
  '01472357': 'admin', '00163550': 'admin', '00389726': 'admin',
  '00556704': 'postulante', '00003899': 'postulante', '00323246': 'postulante', '3514594': 'postulante',
  '00369652': 'representante', '00571505': 'representante', '03089625': 'representante', '00579532': 'representante',
  '00000021': 'subcomite', '03141968': 'evaluador', '03121606': 'evaluador',
};

// Fase de la postulación respecto de la clarificación.
const FASE = `CASE WHEN c.ENCURSO = 0 AND c.RESULTADOSPUBLICADOS = 1 THEN 'cerrada+publicada'
  WHEN c.RESULTADOSPUBLICADOS = 1 THEN 'en curso+publicada' WHEN c.ENCURSO = 1 THEN 'en curso' ELSE 'cerrada' END`;
const CLARIF = `CASE p.ESTADOSOLICITUDCLARIFICACION WHEN 1 THEN 'solicitada' WHEN 2 THEN 'respondida' END`;

(async () => {
  await cds.connect.to('db');
  const q = (sql, p) => cds.db.run(sql, p);

  for (const [nomina, rolDoc] of Object.entries(USUARIOS)) {
    const out = [];
    const adm = await q(`SELECT PRINCIPAL, ACTIVO, TIPOPOSTULACIONID TIPO FROM DB_ENTITY_CLASIF_ADMINISTRADOR WHERE NOMINA = ?`, [nomina]);
    for (const a of adm) out.push(`admin ${a.PRINCIPAL ? 'principal' : 'SECUNDARIO'} tipo=${a.TIPO}${a.ACTIVO ? '' : ' (inactivo)'}`);

    const [rep] = await q(`SELECT ID FROM DB_ENTITY_CLASIF_REPRESENTANTE WHERE NOMINA = ?`, [nomina]);
    const rid = rep ? rep.ID : -1;

    // Postulaciones con clarificación según la relación del usuario.
    const filas = await q(`
      SELECT rel, p.ID, ${CLARIF} CLARIF, ${FASE} FASE, p.EVALUACIONSUBCOMITE EVAL FROM (
        SELECT 'postulante' rel, ID PID FROM DB_ENTITY_CLASIF_POSTULACION WHERE USERNAME = ?
        UNION ALL SELECT 'representante', ID FROM DB_ENTITY_CLASIF_POSTULACION WHERE REPRESENTANTEID = ?
        UNION ALL SELECT CASE WHEN s.COORDINADORID = ? AND s.SECRETARIOID = ? THEN 'coord+secret'
                              WHEN s.COORDINADORID = ? THEN 'coordinador' ELSE 'secretario' END, sp.POSTULACIONID
          FROM DB_ENTITY_CLASIF_SUBCOMITE_POSTUL sp JOIN DB_ENTITY_CLASIF_SUBCOMITE s ON s.ID = sp.SUBCOMITEID
          WHERE s.COORDINADORID = ? OR s.SECRETARIOID = ?
        UNION ALL SELECT 'miembro subcomité', sp.POSTULACIONID
          FROM DB_ENTITY_CLASIF_SUBCOMITE_POSTUL sp JOIN DB_ENTITY_CLASIF_SUBCOMITE_INTEGRANTE i ON i.SUBCOMITEID = sp.SUBCOMITEID
          JOIN DB_ENTITY_CLASIF_SUBCOMITE s ON s.ID = sp.SUBCOMITEID
          WHERE i.REPRESENTANTEID = ? AND s.COORDINADORID <> ? AND s.SECRETARIOID <> ?
      ) r JOIN DB_ENTITY_CLASIF_POSTULACION p ON p.ID = r.PID JOIN DB_ENTITY_CLASIF_CONVOCATORIA c ON c.ID = p.CONVOCATORIAID
      WHERE p.ESTADOSOLICITUDCLARIFICACION IS NOT NULL AND p.ACTIVO = 1
      ORDER BY rel, p.ID DESC`, [nomina, rid, rid, rid, rid, rid, rid, rid, rid, rid]);

    const porRel = {};
    for (const f of filas) (porRel[f.REL] ??= []).push(`#${f.ID} ${f.CLARIF} ${f.FASE}${f.EVAL != null ? ' comité=' + f.EVAL : ''}`);
    for (const [rel, ps] of Object.entries(porRel)) out.push(`${rel}: ${ps.slice(0, 4).join(' · ')}${ps.length > 4 ? ` (+${ps.length - 4})` : ''}`);

    console.log(`\nL${nomina.padStart(8, '0')} (${rolDoc} según doc)`);
    console.log(out.length ? out.map(l => '  ' + l).join('\n') : '  sin datos de clarificación');
  }
  process.exit(0);
})().catch(e => { console.error('ERROR', e.message); process.exit(1); });
