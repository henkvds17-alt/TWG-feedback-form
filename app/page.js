"use client";

import { useRouter } from "next/navigation";

export default function StartPage() {
  const router = useRouter();

  return (
    <main className="screen">
      <img className="mascot" src="/woodworking-guy.webp" alt="The Woodworking Guy" />
      <h1>Hey, builder!</h1>
      <p className="subtitle">
        I&apos;m The Woodworking Guy. Finished your project? I&apos;d love to
        hear all about it — just talk to me like you would a friend.
      </p>
      <button className="primary" onClick={() => router.push("/interview")}>
        Start Talking
      </button>
    </main>
  );
}
