// Datos de ejemplo (inventados) que usan el seed (src/seed.js) y el «negocio de ejemplo» del sitio de pruebas.
// Sin dependencias de Node: también se cargan dentro del Worker.

// Catálogo ficticio (precios inventados, solo para probar la aplicación).
export const CATALOGO = {
  "Hematología": [
    ["Hematología completa", 4, "Cuenta de glóbulos rojos, blancos y plaquetas.", null],
    ["Velocidad de sedimentación globular (VSG)", 3, null, null],
    ["Grupo sanguíneo y Rh", 3, null, null],
    ["Reticulocitos", 3.5, null, null],
  ],
  "Coagulación": [
    ["Tiempo de protrombina (TP)", 4, null, null],
    ["Tiempo parcial de tromboplastina (TPT)", 4, null, null],
  ],
  "Química sanguínea": [
    ["Glicemia", 2.5, "Nivel de azúcar en la sangre.", "Ayuno de 8 horas"],
    ["Urea", 2.5, null, null],
    ["Creatinina", 2.5, null, null],
    ["Ácido úrico", 2.5, null, null],
    ["Colesterol total", 3, null, "Ayuno de 12 horas"],
    ["HDL colesterol", 3.5, null, "Ayuno de 12 horas"],
    ["LDL colesterol", 3.5, null, "Ayuno de 12 horas"],
    ["Triglicéridos", 3, null, "Ayuno de 12 horas"],
    ["TGO (AST)", 3, null, null],
    ["TGP (ALT)", 3, null, null],
    ["Hemoglobina glicosilada (HbA1c)", 9, null, null],
    ["Proteínas totales", 3, null, null],
  ],
  "Orina": [
    ["Orina completa", 3, null, "Primera orina de la mañana, en frasco estéril"],
    ["Urocultivo", 8, null, "Primera orina de la mañana, en frasco estéril"],
    ["Microalbuminuria", 6, null, null],
  ],
  "Heces": [
    ["Heces completa", 3, null, "Muestra fresca, en frasco limpio"],
    ["Sangre oculta en heces", 4, null, null],
    ["Coprocultivo", 8, null, "Muestra fresca, en frasco estéril"],
  ],
  "Hormonas": [
    ["TSH", 6, "Hormona estimulante de la tiroides.", null],
    ["T4 libre", 6, null, null],
    ["T3 libre", 6, null, null],
    ["Prolactina", 7, null, null],
    ["Insulina basal", 8, null, "Ayuno de 8 horas"],
  ],
  "Inmunología": [
    ["VDRL", 3, null, null],
    ["VIH (prueba de tamizaje)", 5, null, null],
    ["PCR cuantitativa", 6, null, null],
    ["Antígeno prostático (PSA)", 8, null, null],
    ["Hepatitis B (HBsAg)", 5, null, null],
  ],
};

// Perfiles con exámenes en común a propósito, para probar la regla anti-duplicados.
export const PERFILES = [
  ["Perfil básico", 14, "Chequeo general de rutina.", [
    "Hematología completa",
    "Glicemia",
    "Urea",
    "Creatinina",
    "Ácido úrico",
    "Colesterol total",
    "Triglicéridos",
    "TGO (AST)",
    "TGP (ALT)",
    "Orina completa",
  ]],
  ["Perfil lipídico", 9, "Control de colesterol y grasas en sangre.", [
    "Colesterol total",
    "HDL colesterol",
    "LDL colesterol",
    "Triglicéridos",
  ]],
  ["Perfil tiroideo", 15, "Evaluación de la función de la tiroides.", [
    "TSH",
    "T4 libre",
    "T3 libre",
  ]],
  ["Chequeo ejecutivo", 28, "Evaluación completa para adultos.", [
    "Hematología completa",
    "Glicemia",
    "Colesterol total",
    "HDL colesterol",
    "LDL colesterol",
    "Triglicéridos",
    "Creatinina",
    "Urea",
    "Ácido úrico",
    "Orina completa",
    "Heces completa",
    "TSH",
    "Antígeno prostático (PSA)",
  ]],
];

// Solo en el negocio de ejemplo del sitio de pruebas: una categoría donde el MISMO examen se puede pedir
// varias veces (hasta 3), para probar el contador − n + del paciente.
export const PATOLOGIA = {
  nombre: "Patología",
  max_por_examen: 3,
  examenes: [
    ["Biopsia de piel", 25, "Estudio de una muestra de tejido.", null],
    ["Citología", 12, null, null],
    ["Estudio de pieza quirúrgica", 40, null, null],
  ],
};
