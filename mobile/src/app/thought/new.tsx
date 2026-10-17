import { randomUUID } from "expo-crypto";
import { router } from "expo-router";
import { useState } from "react";

import { ThoughtForm } from "@/components/thought-form";
import { useAuth } from "@/lib/auth";
import type { SupportOverview } from "@/lib/types";

export default function NewThoughtScreen() {
  const { request } = useAuth();
  // One id per form, so a retry after a dropped connection can't save the thought twice.
  const [requestId] = useState(() => randomUUID());

  return (
    <ThoughtForm
      submitLabel="Create card"
      onSubmit={async (input) => {
        await request("/v1/thoughts", { method: "POST", body: { ...input, requestId } });

        // A very low entry may start (or continue) a rough patch: offer support straight away.
        if (input.mood <= 2) {
          const support = await request<SupportOverview>("/v1/support").catch(() => null);

          if (support?.status.active) {
            router.replace("/support");
            return;
          }
        }

        router.back();
      }}
    />
  );
}
