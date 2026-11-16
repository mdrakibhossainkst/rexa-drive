import { useSyncExternalStore } from "react";

export type Lang = "en" | "bn";

const dict = {
  en: {
    tagline: "Your Telegram, as a beautiful drive.",
    setupTitle: "Connect your Telegram",
    setupHelp:
      "Create an app at my.telegram.org → API development tools, then paste the API ID and API hash here. They stay on this device.",
    apiId: "API ID",
    apiHash: "API hash",
    continue: "Continue",
    phoneTitle: "Sign in",
    phone: "Phone number (with country code)",
    sendCode: "Send code",
    codeTitle: "Enter the code",
    codeHelp: "Telegram sent a login code to your Telegram app or SMS.",
    code: "Login code",
    verify: "Verify",
    passTitle: "Two-step password",
    passHelp: "Your account is protected with a cloud password.",
    password: "Password",
    unlock: "Unlock",
    back: "Back",
    drive: "Drive",
    search: "Search files…",
    upload: "Upload",
    download: "Download",
    delete: "Delete",
    refresh: "Refresh",
    logout: "Sign out",
    grid: "Grid",
    list: "List",
    sortNew: "Newest",
    sortOld: "Oldest",
    sortName: "Name",
    sortSize: "Size",
    all: "All",
    images: "Images",
    videos: "Videos",
    audio: "Audio",
    docs: "Documents",
    archives: "Archives",
    other: "Other",
    files: "files",
    selected: "selected",
    clear: "Clear",
    empty: "Nothing here yet",
    emptyHelp: "Drop files anywhere or tap Upload to send them to your Saved Messages.",
    dropHere: "Drop to upload",
    transfers: "Transfers",
    noTransfers: "No transfers yet",
    staging: "Preparing",
    sending: "Sending to Telegram",
    receiving: "Downloading",
    done: "Done",
    failed: "Failed",
    savedTo: "Saved to",
    confirmDelete: "Delete the selected files from Telegram? This cannot be undone.",
    loading: "Loading your files…",
    storageUsed: "Used",
    language: "বাংলা",
  },
  bn: {
    tagline: "আপনার টেলিগ্রাম, একটি সুন্দর ড্রাইভ হিসেবে।",
    setupTitle: "টেলিগ্রাম সংযুক্ত করুন",
    setupHelp:
      "my.telegram.org → API development tools থেকে অ্যাপ তৈরি করে API ID ও API hash এখানে দিন। এগুলো শুধু এই ডিভাইসেই থাকবে।",
    apiId: "API ID",
    apiHash: "API hash",
    continue: "এগিয়ে যান",
    phoneTitle: "সাইন ইন",
    phone: "ফোন নম্বর (দেশের কোডসহ)",
    sendCode: "কোড পাঠান",
    codeTitle: "কোড লিখুন",
    codeHelp: "টেলিগ্রাম আপনার অ্যাপে বা SMS-এ লগইন কোড পাঠিয়েছে।",
    code: "লগইন কোড",
    verify: "যাচাই করুন",
    passTitle: "টু-স্টেপ পাসওয়ার্ড",
    passHelp: "আপনার অ্যাকাউন্টে ক্লাউড পাসওয়ার্ড দেওয়া আছে।",
    password: "পাসওয়ার্ড",
    unlock: "আনলক",
    back: "পিছনে",
    drive: "ড্রাইভ",
    search: "ফাইল খুঁজুন…",
    upload: "আপলোড",
    download: "ডাউনলোড",
    delete: "ডিলিট",
    refresh: "রিফ্রেশ",
    logout: "সাইন আউট",
    grid: "গ্রিড",
    list: "লিস্ট",
    sortNew: "নতুন আগে",
    sortOld: "পুরনো আগে",
    sortName: "নাম",
    sortSize: "সাইজ",
    all: "সব",
    images: "ছবি",
    videos: "ভিডিও",
    audio: "অডিও",
    docs: "ডকুমেন্ট",
    archives: "আর্কাইভ",
    other: "অন্যান্য",
    files: "টি ফাইল",
    selected: "টি নির্বাচিত",
    clear: "বাতিল",
    empty: "এখানে এখনো কিছু নেই",
    emptyHelp: "যেকোনো জায়গায় ফাইল ড্রপ করুন বা আপলোড চাপুন; ফাইল আপনার Saved Messages-এ যাবে।",
    dropHere: "আপলোড করতে ছেড়ে দিন",
    transfers: "ট্রান্সফার",
    noTransfers: "এখনো কোনো ট্রান্সফার নেই",
    staging: "প্রস্তুত হচ্ছে",
    sending: "টেলিগ্রামে পাঠানো হচ্ছে",
    receiving: "ডাউনলোড হচ্ছে",
    done: "সম্পন্ন",
    failed: "ব্যর্থ",
    savedTo: "সংরক্ষিত হয়েছে",
    confirmDelete: "নির্বাচিত ফাইল টেলিগ্রাম থেকে ডিলিট করবেন? এটি ফেরানো যাবে না।",
    loading: "আপনার ফাইল লোড হচ্ছে…",
    storageUsed: "ব্যবহৃত",
    language: "English",
  },
} as const;

export type Key = keyof (typeof dict)["en"];

const listeners = new Set<() => void>();
let current: Lang = (() => {
  try {
    const saved = localStorage.getItem("rexa-lang") as Lang | null;
    if (saved === "en" || saved === "bn") return saved;
  } catch {}
  return navigator.language?.toLowerCase().startsWith("bn") ? "bn" : "en";
})();

export function setLang(l: Lang) {
  current = l;
  try {
    localStorage.setItem("rexa-lang", l);
  } catch {}
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}

export function toggleLang() {
  setLang(current === "en" ? "bn" : "en");
}

export function useT() {
  const lang = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
  return (k: Key): string => dict[lang][k];
}
