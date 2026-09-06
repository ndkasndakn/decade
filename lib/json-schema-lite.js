function describeValue(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function matchesType(value, type) {
  if (Array.isArray(type)) return type.some((candidate) => matchesType(value, candidate));
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "null") return value === null;
  return true;
}

function validateNode(value, schema, path, errors) {
  if (!schema || typeof schema !== "object") return;

  if (schema.type && !matchesType(value, schema.type)) {
    errors.push(`${path} must be ${schema.type}; received ${describeValue(value)}`);
    return;
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => Object.is(candidate, value))) {
    errors.push(`${path} must be one of: ${schema.enum.join(", ")}`);
  }

  if (typeof value === "number") {
    if (typeof schema.minimum === "number" && value < schema.minimum) {
      errors.push(`${path} must be greater than or equal to ${schema.minimum}`);
    }
    if (typeof schema.maximum === "number" && value > schema.maximum) {
      errors.push(`${path} must be less than or equal to ${schema.maximum}`);
    }
  }

  if (typeof value === "string") {
    if (typeof schema.minLength === "number" && value.length < schema.minLength) {
      errors.push(`${path} must contain at least ${schema.minLength} characters`);
    }
    if (typeof schema.maxLength === "number" && value.length > schema.maxLength) {
      errors.push(`${path} must contain at most ${schema.maxLength} characters`);
    }
  }

  if (schema.type !== "object" || value === null || Array.isArray(value)) return;

  const properties = schema.properties || {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      errors.push(`${path}.${key} is required`);
    }
  }

  for (const [key, childValue] of Object.entries(value)) {
    const childSchema = properties[key];
    if (!childSchema) {
      if (schema.additionalProperties === false) {
        errors.push(`${path}.${key} is unexpected`);
      }
      continue;
    }
    validateNode(childValue, childSchema, `${path}.${key}`, errors);
  }
}

export function validateJsonSchema(value, schema) {
  const errors = [];
  validateNode(value, schema, "arguments", errors);
  return { valid: errors.length === 0, errors };
}
