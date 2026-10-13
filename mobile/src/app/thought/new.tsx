import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { useState } from "react";

import { ThoughtForm } from "@/components/thought-form";
import { useAuth } from "@/lib/auth";

export default function NewThoughtScreen() {
  const { request } = useAuth();
  // One id per form, so a retry after a dropped connection can't save the thought twice.
  const [requestId] = useState(() => randomUUID());

  return (
    <ThoughtForm
      submitLabel="Create card"
      onSubmit={async (input) => {
        await request("/thoughts", { method: "POST", body: { ...input, requestId } });
        router.back();
      }}
    />
  );
}
