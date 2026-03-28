import http from "k6/http";
import { check, fail } from "k6";

export function setupSession(config) {
  const baseUrl = config.baseUrl;
  const credentials = config.credentials;
  const durationMetric = config.durationMetric || null;

  const jar = authenticate(baseUrl, credentials, durationMetric);
  const jwt = getJwt(baseUrl, jar, durationMetric);
  const servers = listServers(baseUrl, jar, durationMetric);

  if (servers.length === 0) {
    console.warn("No servers found for user - WS tests will be skipped");
    return { jwt: jwt, serverId: null, channelId: null };
  }

  const server = servers[0];
  const channels = listChannels(baseUrl, jar, server.id, durationMetric);

  if (channels.length === 0) {
    console.warn("No channels found in server - WS tests will be skipped");
    return { jwt: jwt, serverId: server.id, channelId: null };
  }

  return {
    jwt: jwt,
    serverId: server.id,
    channelId: findPreferredChannel(channels).id,
  };
}

export function setupLoadFixture(config) {
  const baseUrl = config.baseUrl;
  const credentials = config.credentials;
  const durationMetric = config.durationMetric || null;
  const channelCount = config.channelCount || 1;
  const serverName =
    config.serverName || __ENV.LOAD_TEST_SERVER_NAME || "k6-release-load";
  const channelPrefix =
    config.channelPrefix || __ENV.LOAD_TEST_CHANNEL_PREFIX || "k6-load";

  const jar = authenticate(baseUrl, credentials, durationMetric);
  const jwt = getJwt(baseUrl, jar, durationMetric);

  let servers = listServers(baseUrl, jar, durationMetric);
  let server = findServerByName(servers, serverName);
  if (!server) {
    server = createServer(baseUrl, jar, serverName, durationMetric);
    servers = listServers(baseUrl, jar, durationMetric);
    server = findServerByName(servers, serverName) || server;
  }

  const channelIds = ensureFixtureChannels(
    baseUrl,
    jar,
    server.id,
    channelCount,
    channelPrefix,
    durationMetric
  );

  return {
    jwt: jwt,
    serverId: server.id,
    channelId: channelIds[0] || null,
    channelIds: channelIds,
  };
}

function authenticate(baseUrl, credentials, durationMetric) {
  const jar = http.cookieJar();

  const csrfStart = Date.now();
  const csrfRes = http.get(baseUrl + "/api/auth/csrf", {
    redirects: 0,
    jar: jar,
  });
  addDuration(durationMetric, csrfStart);

  const csrfOk = check(csrfRes, {
    "CSRF endpoint returns 200": function (response) {
      return response.status === 200;
    },
  });

  if (!csrfOk) {
    fail("CSRF fetch failed: status=" + csrfRes.status + " body=" + csrfRes.body);
  }

  let csrfToken = "";
  try {
    const csrfBody = JSON.parse(csrfRes.body);
    csrfToken = csrfBody.csrfToken || "";
  } catch (error) {
    fail("Failed to parse CSRF response");
  }

  const loginStart = Date.now();
  const loginRes = http.post(
    baseUrl + "/api/auth/callback/credentials",
    {
      email: credentials.email,
      password: credentials.password,
      csrfToken: csrfToken,
      json: "true",
    },
    {
      redirects: 0,
      jar: jar,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );
  addDuration(durationMetric, loginStart);

  const loginOk = check(loginRes, {
    "Login returns 200 or 302": function (response) {
      return response.status === 200 || response.status === 302;
    },
  });

  if (!loginOk) {
    fail("Login failed: status=" + loginRes.status + " body=" + loginRes.body);
  }

  if (loginRes.status === 302) {
    const location = loginRes.headers["Location"] || loginRes.headers["location"];
    if (location) {
      const redirectUrl = location.indexOf("http") === 0 ? location : baseUrl + location;
      const redirectStart = Date.now();
      http.get(redirectUrl, { jar: jar, redirects: 5 });
      addDuration(durationMetric, redirectStart);
    }
  }

  return jar;
}

function getJwt(baseUrl, jar, durationMetric) {
  const tokenStart = Date.now();
  const tokenRes = http.get(baseUrl + "/api/auth/token", { jar: jar });
  addDuration(durationMetric, tokenStart);

  const tokenOk = check(tokenRes, {
    "Token endpoint returns 200": function (response) {
      return response.status === 200;
    },
    "Token response has token field": function (response) {
      try {
        return !!JSON.parse(response.body).token;
      } catch (error) {
        return false;
      }
    },
  });

  if (!tokenOk) {
    fail("Token fetch failed: status=" + tokenRes.status + " body=" + tokenRes.body);
  }

  return JSON.parse(tokenRes.body).token;
}

function listServers(baseUrl, jar, durationMetric) {
  const serversStart = Date.now();
  const serversRes = http.get(baseUrl + "/api/servers", { jar: jar });
  addDuration(durationMetric, serversStart);

  check(serversRes, {
    "Servers list returns 200": function (response) {
      return response.status === 200;
    },
  });

  try {
    const body = JSON.parse(serversRes.body);
    return body.servers || [];
  } catch (error) {
    return [];
  }
}

function listChannels(baseUrl, jar, serverId, durationMetric) {
  const channelsStart = Date.now();
  const channelsRes = http.get(baseUrl + "/api/servers/" + serverId + "/channels", {
    jar: jar,
  });
  addDuration(durationMetric, channelsStart);

  check(channelsRes, {
    "Channels list returns 200": function (response) {
      return response.status === 200;
    },
  });

  try {
    const body = JSON.parse(channelsRes.body);
    return body.channels || [];
  } catch (error) {
    return [];
  }
}

function findPreferredChannel(channels) {
  for (let i = 0; i < channels.length; i += 1) {
    if (channels[i].name === "general") {
      return channels[i];
    }
  }

  return channels[0];
}

function addDuration(durationMetric, startTime) {
  if (!durationMetric) {
    return;
  }

  durationMetric.add(Date.now() - startTime);
}

function findServerByName(servers, serverName) {
  for (let i = 0; i < servers.length; i += 1) {
    if (servers[i].name === serverName) {
      return servers[i];
    }
  }

  return null;
}

function createServer(baseUrl, jar, serverName, durationMetric) {
  const serverStart = Date.now();
  const serverRes = http.post(
    baseUrl + "/api/servers",
    JSON.stringify({
      name: serverName,
      defaultChannelName: "general",
    }),
    {
      jar: jar,
      headers: { "Content-Type": "application/json" },
    }
  );
  addDuration(durationMetric, serverStart);

  const serverOk = check(serverRes, {
    "Load fixture server create returns 201": function (response) {
      return response.status === 201;
    },
  });

  if (!serverOk) {
    fail(
      "Load fixture server create failed: status=" +
        serverRes.status +
        " body=" +
        serverRes.body
    );
  }

  return JSON.parse(serverRes.body);
}

function createChannel(baseUrl, jar, serverId, channelName, durationMetric) {
  const channelStart = Date.now();
  const channelRes = http.post(
    baseUrl + "/api/servers/" + serverId + "/channels",
    JSON.stringify({ name: channelName }),
    {
      jar: jar,
      headers: { "Content-Type": "application/json" },
    }
  );
  addDuration(durationMetric, channelStart);

  const channelOk = check(channelRes, {
    "Load fixture channel create returns 201": function (response) {
      return response.status === 201;
    },
  });

  if (!channelOk) {
    fail(
      "Load fixture channel create failed: status=" +
        channelRes.status +
        " body=" +
        channelRes.body
    );
  }

  return JSON.parse(channelRes.body);
}

function ensureFixtureChannels(
  baseUrl,
  jar,
  serverId,
  channelCount,
  channelPrefix,
  durationMetric
) {
  const desiredChannels = [];
  const existingChannels = listChannels(baseUrl, jar, serverId, durationMetric);
  const existingByName = {};

  for (let i = 0; i < existingChannels.length; i += 1) {
    existingByName[existingChannels[i].name] = existingChannels[i];
  }

  if (!existingByName.general) {
    existingByName.general = createChannel(
      baseUrl,
      jar,
      serverId,
      "general",
      durationMetric
    );
  }
  desiredChannels.push(existingByName.general);

  for (let i = 1; i < channelCount; i += 1) {
    const channelName =
      channelPrefix + "-" + String(i).padStart(2, "0");
    if (!existingByName[channelName]) {
      existingByName[channelName] = createChannel(
        baseUrl,
        jar,
        serverId,
        channelName,
        durationMetric
      );
    }
    desiredChannels.push(existingByName[channelName]);
  }

  return desiredChannels.map(function (channel) {
    return channel.id;
  });
}
