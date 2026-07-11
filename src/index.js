import { jwtVerify, createRemoteJWKSet, SignJWT } from "jose";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// GoogleのJWKS(公開鍵セット)。モジュールスコープでキャッシュされる。
const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
  });
}

function unauthorizedResponse(message = "認証が必要です") {
  return jsonResponse({ error: message }, 401);
}

// ---------- 認証まわり ----------

async function verifyGoogleIdToken(credential, env) {
  if (!env.GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID未設定");
  }
  const { payload } = await jwtVerify(credential, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: env.GOOGLE_CLIENT_ID,
  });
  return payload; // sub, email, name, picture を含む
}

async function findOrCreateUser(env, { sub, email, name, picture }) {
  let user = await env.study_log_db
    .prepare("SELECT id, google_uid, email, name, avatar_url FROM users WHERE google_uid = ?")
    .bind(sub)
    .first();

  if (!user) {
    const result = await env.study_log_db
      .prepare("INSERT INTO users (google_uid, email, name, avatar_url) VALUES (?, ?, ?, ?)")
      .bind(sub, email ?? null, name ?? null, picture ?? null)
      .run();
    user = { id: result.meta.last_row_id, google_uid: sub, email, name, avatar_url: picture };
  } else {
    await env.study_log_db
      .prepare("UPDATE users SET email = ?, name = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(email ?? null, name ?? null, picture ?? null, user.id)
      .run();
  }

  return user;
}

async function createSessionToken(env, userId) {
  if (!env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET未設定");
  }
  const secret = new TextEncoder().encode(env.SESSION_SECRET);
  return await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

async function verifySessionToken(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice(7);

  try {
    const secret = new TextEncoder().encode(env.SESSION_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return payload.uid;
  } catch {
    return null;
  }
}

// ---------- バリデーション・日付ユーティリティ(既存のまま) ----------

function validateStudyLogInput({ studied_on, minutes, recall_score }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(studied_on ?? "")) {
    return "日付はYYYY-MM-DD形式で入力してください";
  }

  const minutesNum = Number(minutes);
  if (!Number.isInteger(minutesNum) || minutesNum <= 0) {
    return "学習時間は1以上の整数で入力してください";
  }

  if (recall_score !== undefined && recall_score !== null && recall_score !== "") {
    const recallScoreNum = Number(recall_score);
    if (!Number.isInteger(recallScoreNum) || recallScoreNum < 1 || recallScoreNum > 5) {
      return "自己採点は1〜5の整数で入力してください";
    }
  }

  return null;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function toDateStr(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function parseDateStr(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const WEEKDAY_LABELS_MON_START = ["月", "火", "水", "木", "金", "土", "日"];

function getDayPeriod(refDateStr, refDate) {
  const dow = (refDate.getUTCDay() + 6) % 7;
  const label = `${refDate.getUTCMonth() + 1}/${refDate.getUTCDate()}(${WEEKDAY_LABELS_MON_START[dow]})`;
  return { start: refDateStr, end: refDateStr, periods: [{ key: refDateStr, date: refDateStr, label }] };
}

function getWeekPeriods(refDate) {
  const dayOfWeek = (refDate.getUTCDay() + 6) % 7;
  const monday = new Date(refDate);
  monday.setUTCDate(refDate.getUTCDate() - dayOfWeek);

  const periods = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    const dateStr = toDateStr(d);
    periods.push({ key: dateStr, date: dateStr, label: WEEKDAY_LABELS_MON_START[i] });
  }

  return { start: periods[0].key, end: periods[6].key, periods };
}

function getMonthPeriods(refDate) {
  const year = refDate.getUTCFullYear();
  const month = refDate.getUTCMonth();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const periods = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
    periods.push({ key: dateStr, date: dateStr, label: String(day) });
  }

  return { start: periods[0].key, end: periods[periods.length - 1].key, periods };
}

function getYearPeriods(refDate) {
  const year = refDate.getUTCFullYear();
  const periods = [];
  for (let m = 1; m <= 12; m++) {
    periods.push({ key: pad(m), date: `${year}-${pad(m)}-01`, label: `${m}月` });
  }
  return { start: `${year}-01-01`, end: `${year}-12-31`, periods };
}

function fillPeriods(periods, dbResults, keyField) {
  const totals = {};
  for (const row of dbResults) {
    totals[row[keyField]] = row.total_minutes;
  }
  return periods.map(p => ({
    period: p.key,
    date: p.date,
    label: p.label,
    total_minutes: totals[p.key] ?? 0,
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // ---------- /auth/google (認証不要で通す) ----------

    if (pathname === "/auth/google" && method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse({ error: "リクエストボディが不正です" }, 400);
      }

      if (!body.credential) {
        return jsonResponse({ error: "credentialが必要です" }, 400);
      }

      let payload;
      try {
        payload = await verifyGoogleIdToken(body.credential, env);
      } catch (e) {
        return jsonResponse({ error: "Google認証トークンが無効です" }, 401);
      }

      const user = await findOrCreateUser(env, payload);
      const token = await createSessionToken(env, user.id);

      return jsonResponse({
        token,
        user: { id: user.id, email: user.email, name: user.name, avatar_url: user.avatar_url },
      });
    }

    // ---------- ここから先は認証必須 ----------

    const userId = await verifySessionToken(request, env);
    if (!userId) {
      return unauthorizedResponse();
    }

    // ---------- /subjects ----------

    if (pathname === "/subjects" && method === "GET") {
      const { results } = await env.study_log_db
        .prepare(`
          SELECT subjects.id, subjects.name, subjects.position, subjects.challenge_enabled,
                 COALESCE(SUM(study_logs.minutes), 0) AS total_minutes
          FROM subjects
          LEFT JOIN study_logs ON study_logs.subject_id = subjects.id
          WHERE subjects.user_id = ?
          GROUP BY subjects.id
          ORDER BY subjects.position ASC, subjects.id ASC
        `)
        .bind(userId)
        .all();
      return jsonResponse(results);
    }

    if (pathname === "/subjects" && method === "POST") {
      const body = await request.json();
      const name = (body.name ?? "").trim();

      if (name === "") {
        return jsonResponse({ error: "科目名を入力してください" }, 400);
      }

      const maxPos = await env.study_log_db
        .prepare("SELECT COALESCE(MAX(position), -1) AS max_pos FROM subjects WHERE user_id = ?")
        .bind(userId)
        .first();

      const result = await env.study_log_db
        .prepare("INSERT INTO subjects (user_id, name, position) VALUES (?, ?, ?)")
        .bind(userId, name, maxPos.max_pos + 1)
        .run();

      return jsonResponse({ id: result.meta.last_row_id, name }, 201);
    }

    const subjectIdMatch = pathname.match(/^\/subjects\/(\d+)$/);
    if (subjectIdMatch && method === "PUT") {
      const subjectId = Number(subjectIdMatch[1]);
      const body = await request.json();
      const name = (body.name ?? "").trim();

      if (name === "") {
        return jsonResponse({ error: "科目名を入力してください" }, 400);
      }

      const subject = await env.study_log_db
        .prepare("SELECT id FROM subjects WHERE id = ? AND user_id = ?")
        .bind(subjectId, userId)
        .first();

      if (!subject) {
        return jsonResponse({ error: "科目が見つかりません" }, 404);
      }

      await env.study_log_db
        .prepare("UPDATE subjects SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(name, subjectId)
        .run();

      return jsonResponse({ updated: true });
    }

    if (subjectIdMatch && method === "DELETE") {
      const subjectId = Number(subjectIdMatch[1]);

      const subject = await env.study_log_db
        .prepare("SELECT id FROM subjects WHERE id = ? AND user_id = ?")
        .bind(subjectId, userId)
        .first();

      if (!subject) {
        return jsonResponse({ error: "科目が見つかりません" }, 404);
      }

      const logCount = await env.study_log_db
        .prepare("SELECT COUNT(*) AS count FROM study_logs WHERE subject_id = ?")
        .bind(subjectId)
        .first();

      if (logCount.count > 0) {
        return jsonResponse(
          { error: `この科目には${logCount.count}件の学習ログが存在するため削除できません` },
          400
        );
      }

      await env.study_log_db
        .prepare("DELETE FROM subjects WHERE id = ?")
        .bind(subjectId)
        .run();

      return jsonResponse({ deleted: true });
    }

    const subjectMoveMatch = pathname.match(/^\/subjects\/(\d+)\/move$/);
    if (subjectMoveMatch && method === "PUT") {
      const subjectId = Number(subjectMoveMatch[1]);
      const body = await request.json();
      const direction = body.direction;

      if (direction !== "up" && direction !== "down") {
        return jsonResponse({ error: "directionはupまたはdownを指定してください" }, 400);
      }

      const { results: ordered } = await env.study_log_db
        .prepare("SELECT id, position FROM subjects WHERE user_id = ? ORDER BY position ASC, id ASC")
        .bind(userId)
        .all();

      const idx = ordered.findIndex(s => s.id === subjectId);
      if (idx === -1) {
        return jsonResponse({ error: "科目が見つかりません" }, 404);
      }

      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= ordered.length) {
        return jsonResponse({ moved: false });
      }

      const current = ordered[idx];
      const target = ordered[swapIdx];

      await env.study_log_db.batch([
        env.study_log_db.prepare("UPDATE subjects SET position = ? WHERE id = ?").bind(target.position, current.id),
        env.study_log_db.prepare("UPDATE subjects SET position = ? WHERE id = ?").bind(current.position, target.id),
      ]);

      return jsonResponse({ moved: true });
    }

    const subjectChallengeMatch = pathname.match(/^\/subjects\/(\d+)\/challenge$/);
    if (subjectChallengeMatch && method === "PUT") {
      const subjectId = Number(subjectChallengeMatch[1]);
      const body = await request.json();
      const enabled = body.enabled ? 1 : 0;

      const subject = await env.study_log_db
        .prepare("SELECT id FROM subjects WHERE id = ? AND user_id = ?")
        .bind(subjectId, userId)
        .first();

      if (!subject) {
        return jsonResponse({ error: "科目が見つかりません" }, 404);
      }

      await env.study_log_db
        .prepare("UPDATE subjects SET challenge_enabled = ? WHERE id = ?")
        .bind(enabled, subjectId)
        .run();

      return jsonResponse({ challenge_enabled: enabled === 1 });
    }

    // ---------- /study_logs ----------

    if (pathname === "/study_logs" && method === "GET") {
      const dateFilter = url.searchParams.get("date");

      const query = dateFilter
        ? env.study_log_db.prepare(`
            SELECT study_logs.id, study_logs.studied_on, study_logs.minutes,
                   study_logs.memo, study_logs.recall_score,
                   subjects.id AS subject_id, subjects.name AS subject_name
            FROM study_logs
            JOIN subjects ON study_logs.subject_id = subjects.id
            WHERE study_logs.user_id = ? AND study_logs.studied_on = ?
            ORDER BY study_logs.id DESC
          `).bind(userId, dateFilter)
        : env.study_log_db.prepare(`
            SELECT study_logs.id, study_logs.studied_on, study_logs.minutes,
                   study_logs.memo, study_logs.recall_score,
                   subjects.id AS subject_id, subjects.name AS subject_name
            FROM study_logs
            JOIN subjects ON study_logs.subject_id = subjects.id
            WHERE study_logs.user_id = ?
            ORDER BY study_logs.studied_on DESC, study_logs.id DESC
          `).bind(userId);

      const { results } = await query.all();
      return jsonResponse(results);
    }

    if (pathname === "/study_logs" && method === "POST") {
      const body = await request.json();
      const { subject_id, studied_on, minutes, memo, recall_score } = body;

      const subject = await env.study_log_db
        .prepare("SELECT id FROM subjects WHERE id = ? AND user_id = ?")
        .bind(subject_id, userId)
        .first();

      if (!subject) {
        return jsonResponse({ error: "指定された科目が見つかりません" }, 400);
      }

      const validationError = validateStudyLogInput({ studied_on, minutes, recall_score });
      if (validationError) {
        return jsonResponse({ error: validationError }, 400);
      }

      const recallScoreNum =
        recall_score !== undefined && recall_score !== null && recall_score !== ""
          ? Number(recall_score)
          : null;

      const result = await env.study_log_db
        .prepare(`
          INSERT INTO study_logs (user_id, subject_id, studied_on, minutes, memo, recall_score)
          VALUES (?, ?, ?, ?, ?, ?)
        `)
        .bind(userId, subject_id, studied_on, Number(minutes), memo ?? null, recallScoreNum)
        .run();

      return jsonResponse({ id: result.meta.last_row_id }, 201);
    }

    const logMatch = pathname.match(/^\/study_logs\/(\d+)$/);
    if (logMatch) {
      const logId = Number(logMatch[1]);

      const existing = await env.study_log_db
        .prepare("SELECT id FROM study_logs WHERE id = ? AND user_id = ?")
        .bind(logId, userId)
        .first();

      if (!existing) {
        return jsonResponse({ error: "学習ログが見つかりません" }, 404);
      }

      if (method === "PUT") {
        const body = await request.json();
        const { subject_id, studied_on, minutes, memo, recall_score } = body;

        const subject = await env.study_log_db
          .prepare("SELECT id FROM subjects WHERE id = ? AND user_id = ?")
          .bind(subject_id, userId)
          .first();

        if (!subject) {
          return jsonResponse({ error: "指定された科目が見つかりません" }, 400);
        }

        const validationError = validateStudyLogInput({ studied_on, minutes, recall_score });
        if (validationError) {
          return jsonResponse({ error: validationError }, 400);
        }

        const recallScoreNum =
          recall_score !== undefined && recall_score !== null && recall_score !== ""
            ? Number(recall_score)
            : null;

        await env.study_log_db
          .prepare(`
            UPDATE study_logs
            SET subject_id = ?, studied_on = ?, minutes = ?, memo = ?, recall_score = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `)
          .bind(subject_id, studied_on, Number(minutes), memo ?? null, recallScoreNum, logId)
          .run();

        return jsonResponse({ updated: true });
      }

      if (method === "DELETE") {
        await env.study_log_db
          .prepare("DELETE FROM study_logs WHERE id = ?")
          .bind(logId)
          .run();

        return jsonResponse({ deleted: true });
      }
    }

    // ---------- /stats ----------

    if (pathname === "/stats/by_subject" && method === "GET") {
      const { results } = await env.study_log_db
        .prepare(`
          SELECT subjects.name AS subject_name, SUM(study_logs.minutes) AS total_minutes
          FROM study_logs
          JOIN subjects ON study_logs.subject_id = subjects.id
          WHERE study_logs.user_id = ?
          GROUP BY subjects.id
          ORDER BY total_minutes DESC
        `)
        .bind(userId)
        .all();
      return jsonResponse(results);
    }

    if (pathname === "/stats/by_period" && method === "GET") {
      const unit = url.searchParams.get("unit") ?? "day";
      const refParam = url.searchParams.get("ref");
      const refDateStr = refParam && /^\d{4}-\d{2}-\d{2}$/.test(refParam) ? refParam : toDateStr(new Date());
      const refDate = parseDateStr(refDateStr);

      if (unit === "day") {
        const { start, periods } = getDayPeriod(refDateStr, refDate);
        const { results } = await env.study_log_db
          .prepare(`
            SELECT studied_on, SUM(minutes) AS total_minutes
            FROM study_logs
            WHERE user_id = ? AND studied_on = ?
            GROUP BY studied_on
          `)
          .bind(userId, start)
          .all();
        return jsonResponse(fillPeriods(periods, results, "studied_on"));
      }

      if (unit === "week") {
        const { start, end, periods } = getWeekPeriods(refDate);
        const { results } = await env.study_log_db
          .prepare(`
            SELECT studied_on, SUM(minutes) AS total_minutes
            FROM study_logs
            WHERE user_id = ? AND studied_on BETWEEN ? AND ?
            GROUP BY studied_on
          `)
          .bind(userId, start, end)
          .all();
        return jsonResponse(fillPeriods(periods, results, "studied_on"));
      }

      if (unit === "month") {
        const { start, end, periods } = getMonthPeriods(refDate);
        const { results } = await env.study_log_db
          .prepare(`
            SELECT studied_on, SUM(minutes) AS total_minutes
            FROM study_logs
            WHERE user_id = ? AND studied_on BETWEEN ? AND ?
            GROUP BY studied_on
          `)
          .bind(userId, start, end)
          .all();
        return jsonResponse(fillPeriods(periods, results, "studied_on"));
      }

      if (unit === "year") {
        const { start, end, periods } = getYearPeriods(refDate);
        const { results } = await env.study_log_db
          .prepare(`
            SELECT strftime('%m', studied_on) AS month_key, SUM(minutes) AS total_minutes
            FROM study_logs
            WHERE user_id = ? AND studied_on BETWEEN ? AND ?
            GROUP BY month_key
          `)
          .bind(userId, start, end)
          .all();
        return jsonResponse(fillPeriods(periods, results, "month_key"));
      }

      return jsonResponse({ error: "unitはday, week, month, yearのいずれかを指定してください" }, 400);
    }

    return jsonResponse({ error: "Not Found" }, 404);
  }
};