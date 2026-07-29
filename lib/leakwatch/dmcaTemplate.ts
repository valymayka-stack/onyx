// Fixed-format legal document (17 U.S.C. § 512(c)(3)) — no LLM needed, this
// is a template-filling problem, not a legal-reasoning one. The hard part of
// takedowns is finding the infringing URL (see scan.ts) and knowing where to
// send this, not writing the notice itself.
export interface DmcaTemplateInput {
  subjectName: string;
  itemUrl: string;
  siteLabel: string;
  agentName: string;
  agentEmail: string;
  agentAddress: string | null;
  originalWorkReference?: string;
}

export function buildDmcaNotice(input: DmcaTemplateInput): string {
  const today = new Date().toLocaleDateString("es-MX", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `Fecha: ${today}

Para: Equipo de abuso/DMCA de ${input.siteLabel}
De: ${input.agentName}, actuando como agente autorizado de ${input.subjectName}

AVISO DE RETIRO DE CONTENIDO (DMCA) — 17 U.S.C. § 512(c)(3)

1. Identificación de la obra protegida:
Contenido fotográfico/audiovisual original de ${input.subjectName}${
    input.originalWorkReference ? `, publicado originalmente en ${input.originalWorkReference}` : ""
  }.

2. Ubicación del material infractor:
${input.itemUrl}

3. Declaración de buena fe:
Declaro de buena fe que el uso del material descrito arriba no está autorizado por
el propietario de los derechos de autor, su agente, o la ley.

4. Declaración de exactitud:
Declaro, bajo pena de perjurio, que la información contenida en este aviso es exacta
y que soy el propietario de los derechos de autor, o estoy autorizado legalmente
para actuar en representación del propietario de un derecho exclusivo que
presuntamente ha sido infringido.

5. Datos de contacto del agente autorizado:
Nombre: ${input.agentName}
Correo: ${input.agentEmail}${input.agentAddress ? `\nDirección: ${input.agentAddress}` : ""}

Firma: ${input.agentName}
`;
}
