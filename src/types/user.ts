export interface User {
  id: number;
  username: string;
  display_name: string;
  created_at?: string;
}

export interface AuthState {
  isLoggedIn: boolean;
  user: User | null;
  token: string | null;
}
