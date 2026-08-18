import type {
  ApplyConstellationPayload,
  ApplyConstellationResult,
  ResolveConstellationPayload,
  ResolveConstellationResult,
  ApiError as ApiErrorResponse,
  ListAccountsResult,
  ListUsersResult,
} from '@zodiaceco/api-types'
import assert from 'assert'
import { UUID } from 'crypto'

export type Options = {
  workspace?: string
  apiKey?: string
  baseUrl?: string
  fetch?: typeof globalThis.fetch
  headers?: Record<string, string>
}

const DEFAULT_API_URL = 'https://app.zodiac.eco/api/v1'

export class ApiClient {
  private apiKey: string
  private baseUrl: string
  private _fetch: typeof fetch
  private headers: Record<string, string>

  constructor({
    // Read `ZODIAC_API_URL`/`ZODIAC_API_KEY` lazily at construction time
    // rather than at module load: the CLI loads `.env` (and `init` writes a
    // fresh one) before the first client is created, so capturing them at
    // import time would bake in the default and ignore the user's config.
    baseUrl = process.env.ZODIAC_API_URL ?? DEFAULT_API_URL,
    fetch: customFetch = fetch,
    headers = {},
    apiKey = process.env.ZODIAC_API_KEY,
  }: Options = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '')
    this._fetch = customFetch
    this.headers = headers

    assert(
      apiKey,
      'No API key provided to the API client. Either pass it as the "apiKey" option or set the ZODIAC_API_KEY environment variable.'
    )

    this.apiKey = apiKey
  }

  protected async postJson(endpoint: string, payload: unknown) {
    const res = await this._fetch(`${this.baseUrl}/${endpoint}`, {
      method: 'POST',
      headers: {
        ...this.headers,
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: jsonStringify(payload),
    })
    if (!res.ok) {
      await handleApiError(res)
    }

    return res.json()
  }

  protected async get(endpoint: string) {
    const res = await this._fetch(`${this.baseUrl}/${endpoint}`, {
      headers: { ...this.headers, authorization: `Bearer ${this.apiKey}` },
    })

    if (!res.ok) {
      await handleApiError(res)
    }

    return res.json()
  }

  listAccounts(): Promise<ListAccountsResult> {
    return this.get('accounts')
  }

  listUsers(): Promise<ListUsersResult> {
    return this.get('users')
  }

  /**
   * Applies an accounts specification to Zodiac OS.
   */
  applyConstellation(
    workspaceId: UUID,
    payload: ApplyConstellationPayload
  ): Promise<ApplyConstellationResult> {
    return this.postJson(
      `workspace/${workspaceId}/constellation/apply`,
      payload
    )
  }

  /**
   * Resolves an accounts specification to Zodiac OS.
   */
  resolveConstellation(
    workspaceId: UUID,
    payload: ResolveConstellationPayload
  ): Promise<ResolveConstellationResult> {
    return this.postJson(
      `workspace/${workspaceId}/constellation/resolve`,
      payload
    )
  }
}

export class ApiRequestError extends Error {
  public readonly status: number
  public readonly statusText: string
  public readonly details?: unknown

  constructor(
    message: string,
    opts: {
      status: number
      statusText: string
      details?: unknown
      cause?: unknown
    }
  ) {
    super(ApiRequestError.composeMessage(message, opts.details))
    this.name = 'ApiRequestError'
    this.status = opts.status
    this.statusText = opts.statusText
    this.details = opts.details
    if (opts.cause !== undefined) {
      ;(this as any).cause = opts.cause
    }
  }

  private static composeMessage(message: string, details?: unknown) {
    if (details == null) return message
    let detailsString: string
    try {
      detailsString =
        typeof details === 'string' ? details : jsonStringify(details, 2)
    } catch (_err) {
      detailsString = String(details)
    }
    return `${message}\nDetails: ${detailsString}`
  }

  toString() {
    return `${this.name}: ${this.message}`
  }
}

async function handleApiError(response: Response): Promise<never> {
  const contentType = response.headers.get('content-type')
  if (contentType?.includes('application/json')) {
    const errorData = (await response.json()) as ApiErrorResponse
    let error: ApiRequestError
    try {
      error = new ApiRequestError(errorData.error.message, {
        status: response.status,
        statusText: response.statusText,
        details: errorData.error.details,
      })
    } catch (jsonShapeError) {
      error = new ApiRequestError(
        `Failed parsing error response: ${jsonShapeError}`,
        {
          status: response.status,
          statusText: response.statusText,
          details: errorData,
        }
      )
    }
    throw error
  } else {
    throw new ApiRequestError(
      `${response.status} ${response.statusText}: ${response.url}`,
      {
        status: response.status,
        statusText: response.statusText,
      }
    )
  }
}

/** JSON.stringify with bigint support */
const jsonStringify = (value: unknown, indent?: number) =>
  JSON.stringify(
    value,
    (_, value) => {
      if (typeof value === 'bigint') {
        return value.toString()
      }

      return value
    },
    indent
  )
