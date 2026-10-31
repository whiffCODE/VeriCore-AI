import { apiUrl } from "@/lib/api";

export type AuthUser = {
  id: string;
  userId?: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "user" | "admin";
  status?: string;
};

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
  user?: T;
};

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | ApiEnvelope<T>
    | { message?: string; error?: string }
    | null;

  if (!response.ok) {
    const message =
      payload && "message" in payload && payload.message
        ? payload.message
        : payload && "error" in payload && payload.error
          ? payload.error
          : "Request failed. Please try again.";

    throw new Error(message);
  }

  if (payload && "data" in payload && payload.data !== undefined) {
    return payload.data as T;
  }

  return payload as T;
}

function normalizeUser(value: unknown): AuthUser {
  const outer = value as { user?: unknown; account?: unknown };
  const candidate = outer?.user ?? outer?.account ?? value;
  const raw = candidate as Record<string, unknown>;

  const id = raw.id ?? raw._id ?? raw.userId;
  if (
    typeof id !== "string" ||
    typeof raw.email !== "string" ||
    typeof raw.firstName !== "string" ||
    typeof raw.lastName !== "string"
  ) {
    throw new Error(
      "The backend returned an unexpected user profile. Check the auth API response mapping.",
    );
  }

  return {
    id,
    userId: typeof raw.userId === "string" ? raw.userId : undefined,
    firstName: raw.firstName,
    lastName: raw.lastName,
    email: raw.email,
    role: raw.role === "admin" ? "admin" : "user",
    status: typeof raw.status === "string" ? raw.status : undefined,
  };
}

// Update these paths to match your existing Express routes.
const AUTH_PATHS = {
  login: "/api/auth/login",
  register: "/api/auth/register",
  logout: "/api/auth/logout",
  me: "/api/account/me",
};

export const authApi = {
  async login(input: { email: string; password: string }) {
    const result = await request<unknown>(AUTH_PATHS.login, {
      method: "POST",
      body: JSON.stringify(input),
    });
    return normalizeUser(result);
  },

  async register(input: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    age: number;
    password: string;
    guardianEmail?: string;
    guardianPhone?: string;
  }) {
    return request<unknown>(AUTH_PATHS.register, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async me() {
    const result = await request<unknown>(AUTH_PATHS.me, {
      method: "GET",
    });
    return normalizeUser(result);
  },

  async logout() {
    return request<unknown>(AUTH_PATHS.logout, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
};
