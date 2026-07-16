"use client";

import { useRef, useTransition } from "react";
import { addItem } from "./actions";

// Laptop capture: paste a link or a note, hit Save. Uses the server action.
export function AddBox() {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      ref={formRef}
      action={(fd) =>
        startTransition(async () => {
          await addItem(fd);
          formRef.current?.reset();
        })
      }
      className="mb-6 flex gap-2"
    >
      <input
        name="input"
        placeholder="Paste a link or jot a thought…"
        aria-label="Add a link or note"
        autoComplete="off"
        className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 dark:border-slate-700 dark:bg-slate-900"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </form>
  );
}
