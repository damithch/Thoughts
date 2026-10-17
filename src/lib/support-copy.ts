import type { RoughPatchStatus } from "./rough-patch.ts";

// Wording for the support card and page (kept plain and warm; the app mirrors it).
export function supportHeadline(status: RoughPatchStatus | null) {
  if (!status?.active) {
    return {
      title: "Your support plan",
      body: "Small things that help when it gets hard. Set them up on a good day so they're ready on a bad one.",
    };
  }

  if (status.reason === "late_night") {
    return {
      title: "It's late, and things feel heavy",
      body: "Nights make everything louder. Nothing needs to be decided tonight.",
    };
  }

  return {
    title: "A heavy stretch",
    body: `Your last ${status.lowStreak} entries have been really hard. You've come through stretches like this before. Start with something small.${
      status.lateNight ? " It's late, too: nothing needs to be decided tonight." : ""
    }`,
  };
}

// Sri Lanka's free ambulance service (Suwa Seriya).
export const AMBULANCE_NUMBER = "1990";

export function urgentLine(helplinePhone: string) {
  return `If you might act on thoughts of hurting yourself, call ${helplinePhone} now or go to the nearest hospital. For an ambulance, call ${AMBULANCE_NUMBER}.`;
}

export function telHref(phone: string) {
  return `tel:${phone.replace(/[^0-9+]/g, "")}`;
}

export function smsHref(phone: string) {
  return `sms:${phone.replace(/[^0-9+]/g, "")}`;
}
