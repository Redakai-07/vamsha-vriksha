/**
 * The real cloud adapter: plain JSON over HTTPS against the endpoint supplied
 * at build time.
 *
 * Contract (every request carries `Authorization: Bearer <access token>`; the
 * server derives the account from the token, so an account id in the body is
 * only ever a hint):
 *
 *   POST  {base}/changes   { since, limit }   -> { records, cursor, hasMore }
 *   GET   {base}/record    ?collection=&id=   -> { record } | 404
 *   POST  {base}/put       PutRecordInput      -> { record } | 409 { current }
 *   GET   {base}/project   ?projectId=        -> { records }
 *   GET   {base}/all                          -> { records }
 *
 * `/put` MUST be a compare-and-set on `baseRev` and MUST answer 409 with the
 * current row when the client is behind - that is the single guarantee the
 * merge logic relies on to avoid destroying data.
 *
 * No credentials are ever handled here: the access token comes from the
 * provider's own flow (see `src/lib/auth/google.ts`), is held in memory only,
 * and is never written to IndexedDB.
 */
import { SyncTransportError } from "@/lib/sync/errors";
import type {
  ListChangesInput,
  ListChangesResult,
  PutRecordInput,
  PutResult,
  RemoteRecord,
  SyncBackend,
  SyncCollection,
} from "@/lib/sync/types";

export { SyncTransportError, isTransportError } from "@/lib/sync/errors";

export interface RemoteBackendOptions {
  baseUrl: string;
  /** Resolves a fresh access token, or null when not signed in. */
  getAccessToken: () => Promise<string | null>;
  /** Injected in tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface RawResponse {
  status: number;
  body: unknown;
}

export function createRemoteBackend(options: RemoteBackendOptions): SyncBackend {
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function raw(path: string, init: RequestInit): Promise<RawResponse> {
    const token = await options.getAccessToken();
    if (!token) throw new SyncTransportError("Not signed in");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch(`${options.baseUrl}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });
      const text = await response.text();
      let body: unknown = null;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          // Never echo a payload into an error: family data must not reach logs.
          throw new SyncTransportError("Sync endpoint returned a non-JSON response");
        }
      }
      return { status: response.status, body };
    } catch (error) {
      if (error instanceof SyncTransportError) throw error;
      throw new SyncTransportError("Could not reach the sync endpoint", error);
    } finally {
      clearTimeout(timer);
    }
  }

  async function ok(path: string, init: RequestInit): Promise<unknown> {
    const response = await raw(path, init);
    if (response.status === 401 || response.status === 403) {
      throw new SyncTransportError("Session expired");
    }
    if (response.status >= 400) {
      throw new SyncTransportError(`Sync endpoint replied ${response.status}`);
    }
    return response.body;
  }

  const post = (path: string, body: unknown) =>
    ok(path, { method: "POST", body: JSON.stringify(body) });

  return {
    kind: "remote",
    label: "Cloud",

    async listChanges(input: ListChangesInput): Promise<ListChangesResult> {
      const body = (await post("/changes", {
        since: input.since,
        limit: input.limit ?? 500,
      })) as Partial<ListChangesResult> | null;
      return {
        records: body?.records ?? [],
        cursor: typeof body?.cursor === "number" ? body.cursor : input.since,
        hasMore: Boolean(body?.hasMore),
      };
    },

    async getRecord(
      _accountId: string,
      collection: SyncCollection,
      id: string,
    ): Promise<RemoteRecord | null> {
      const response = await raw(
        `/record?collection=${encodeURIComponent(collection)}&id=${encodeURIComponent(id)}`,
        { method: "GET" },
      );
      if (response.status === 404) return null;
      if (response.status >= 400) throw new SyncTransportError(`Sync endpoint replied ${response.status}`);
      return ((response.body as { record?: RemoteRecord } | null)?.record ?? null);
    },

    async putRecord(input: PutRecordInput): Promise<PutResult> {
      const { accountId: _accountId, ...body } = input;
      const response = await raw("/put", { method: "POST", body: JSON.stringify(body) });
      if (response.status === 409) {
        return { ok: false, current: (response.body as { current?: RemoteRecord } | null)?.current ?? null };
      }
      if (response.status === 401 || response.status === 403) {
        throw new SyncTransportError("Session expired");
      }
      if (response.status >= 400) {
        throw new SyncTransportError(`Sync endpoint replied ${response.status}`);
      }
      const record = (response.body as { record?: RemoteRecord } | null)?.record;
      if (!record) throw new SyncTransportError("Sync endpoint accepted a write without returning it");
      return { ok: true, record };
    },

    async listProject(_accountId: string, projectId: string): Promise<RemoteRecord[]> {
      const body = (await ok(`/project?projectId=${encodeURIComponent(projectId)}`, {
        method: "GET",
      })) as { records?: RemoteRecord[] } | null;
      return body?.records ?? [];
    },

    async listAll(_accountId: string): Promise<RemoteRecord[]> {
      const body = (await ok("/all", { method: "GET" })) as { records?: RemoteRecord[] } | null;
      return body?.records ?? [];
    },
  };
}
