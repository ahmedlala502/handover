export type BasicAuthCredentials = {
  username: string;
  password: string;
};

export type BasicAuthEvaluation = {
  configured: boolean;
  authorized: boolean;
};

export function basicAuthChallenge(realm: string) {
  return `Basic realm="${realm.replaceAll('"', "")}", charset="UTF-8"`;
}

export function parseBasicAuthHeader(
  authorizationHeader: string | null,
): BasicAuthCredentials | null {
  if (!authorizationHeader?.startsWith("Basic ")) {
    return null;
  }

  const encoded = authorizationHeader.slice("Basic ".length).trim();

  try {
    const decoded = atob(encoded);
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex <= 0) {
      return null;
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

export function evaluateBasicAuth(
  authorizationHeader: string | null,
  expectedUsername: string | undefined,
  expectedPassword: string | undefined,
): BasicAuthEvaluation {
  if (!expectedUsername || !expectedPassword) {
    return { configured: false, authorized: false };
  }

  const credentials = parseBasicAuthHeader(authorizationHeader);

  return {
    configured: true,
    authorized:
      credentials !== null &&
      stableEquals(credentials.username, expectedUsername) &&
      stableEquals(credentials.password, expectedPassword),
  };
}

function stableEquals(value: string, expected: string) {
  if (value.length !== expected.length) {
    return false;
  }

  let diff = 0;
  for (let index = 0; index < value.length; index += 1) {
    diff |= value.charCodeAt(index) ^ expected.charCodeAt(index);
  }

  return diff === 0;
}
