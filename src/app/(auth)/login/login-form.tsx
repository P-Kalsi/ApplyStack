"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

const initialState: AuthState = { error: null };

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <h1 className="text-title text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink-muted">Welcome back. Your pipeline is waiting.</p>
      </div>
      <input type="hidden" name="next" value={next} />
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" spellCheck={false} required autoFocus />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error ? (
        <p role="alert" className="rounded-md border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" className="w-full" loading={pending}>
        Sign in
      </Button>
      <p className="text-center text-sm text-ink-muted">
        No account?{" "}
        <Link href="/signup" className="font-medium text-accent underline-offset-2 hover:underline">
          Create one
        </Link>
      </p>
    </form>
  );
}
