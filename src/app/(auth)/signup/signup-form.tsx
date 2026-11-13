"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signUp, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

const initialState: AuthState = { error: null };

export function SignupForm() {
  const [state, formAction, pending] = useActionState(signUp, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <h1 className="text-title text-ink">Create your account</h1>
        <p className="mt-1 text-sm text-ink-muted">
          One master profile. Job-specific resumes in one click.
        </p>
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" spellCheck={false} required autoFocus />
      </div>
      <div>
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="mt-1.5 text-xs text-ink-faint">At least 8 characters.</p>
      </div>
      {state.error ? (
        <p role="alert" className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-ink">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" className="w-full" loading={pending}>
        Create account
      </Button>
      <p className="text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent underline-offset-2 hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
