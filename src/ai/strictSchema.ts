// OpenAI strict json_schema 규칙 점검용 순수 함수. (테스트와 스모크 스크립트에서 요청 전에 스키마를 확인한다)
// 모든 object 는 additionalProperties:false 이고 properties 를 전부 required 에 넣어야 하며,
// Gemini 전용 표기(대문자 type, nullable, propertyOrdering)는 쓰지 않는다.
const FORBIDDEN_KEYS = ['nullable', 'propertyOrdering', 'allOf', 'not', 'if', 'then', 'else'] as const;
const OBJECT_TYPE = 'object';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function findStrictViolations(schema: unknown, path = '$'): string[] {
  if (!isRecord(schema)) return [`${path}: 스키마가 객체가 아니에요`];
  const problems: string[] = [];

  for (const key of FORBIDDEN_KEYS) {
    if (key in schema) problems.push(`${path}: '${key}' 는 쓸 수 없어요`);
  }

  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  for (const type of types) {
    if (typeof type === 'string' && type !== type.toLowerCase()) problems.push(`${path}: type '${type}' 은 소문자여야 해요`);
  }

  // 대문자(OBJECT)로 적었어도 object 로 보고 나머지 규칙을 계속 점검한다.
  if (types.some((type) => typeof type === 'string' && type.toLowerCase() === OBJECT_TYPE)) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    if (schema.additionalProperties !== false) problems.push(`${path}: additionalProperties 는 false 여야 해요`);
    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    for (const name of Object.keys(properties)) {
      if (!required.includes(name)) problems.push(`${path}.${name}: required 에 없어요`);
    }
    for (const name of required) {
      if (!(name in properties)) problems.push(`${path}.${name}: required 인데 properties 에 없어요`);
    }
    for (const [name, child] of Object.entries(properties)) problems.push(...findStrictViolations(child, `${path}.${name}`));
  }

  if (schema.items !== undefined) problems.push(...findStrictViolations(schema.items, `${path}[]`));
  if (Array.isArray(schema.anyOf)) {
    schema.anyOf.forEach((option, index) => problems.push(...findStrictViolations(option, `${path}|${index}`)));
  }
  return problems;
}
