"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const SILENCE_RMS_THRESHOLD = 0.02;
const SILENCE_DURATION_MS = 2800;
const MIN_SPEAKING_MS_BEFORE_AUTOSTOP = 700;
const MAX_RECORDING_MS = 45000;

const SILENT_AUDIO_SRC =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQIAAAB/fw==";

function pickMimeType() {
  const candidates = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(type)) {
      return type;
    }
  }
  return "";
}

function pickMaleSystemVoice() {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;

  const maleNamePatterns = /male|david|daniel|alex|fred|mark|guy|tom|oliver|george|arthur|james/i;
  const englishMale = voices.find((v) => /^en/i.test(v.lang) && maleNamePatterns.test(v.name));
  if (englishMale) return englishMale;

  const anyMale = voices.find((v) => maleNamePatterns.test(v.name));
  if (anyMale) return anyMale;

  return null;
}

export default function InterviewPage() {
  const router = useRouter();
  const [micState, setMicState] = useState("idle");
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [isMock, setIsMock] = useState(false);
  const [lastReplyText, setLastReplyText] = useState("");
  const [isPaused, setIsPaused] = useState(false);

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const historyRef = useRef([]);
  const audioRef = useRef(null);
  const conversationIdRef = useRef(
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
  );
  const startedAtRef = useRef(new Date().toISOString());
  const startedConversationRef = useRef(false);

  // Shared Web Audio setup, created once (see handleStart) instead of a
  // fresh AudioContext per recording. Mobile Safari is strict about audio
  // contexts started outside a direct tap - constantly recreating one on
  // every turn meant it silently stayed suspended on iPhone, breaking
  // silence-detection there. It's also reused to gently normalize the
  // AI's reply volume, since each OpenAI TTS call generates its own
  // loudness and can vary question to question.
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const audioGraphRef = useRef(null);
  const silenceIntervalRef = useRef(null);
  const lastReplyAudioSrcRef = useRef(null);

  function ensureAudioGraph() {
    if (!audioCtxRef.current || !audioRef.current || audioGraphRef.current) return;
    try {
      const source = audioCtxRef.current.createMediaElementSource(audioRef.current);
      const compressor = audioCtxRef.current.createDynamicsCompressor();
      // Gentle settings on purpose - an earlier, more aggressive setting
      // (lower threshold, higher ratio, fast attack) caused audible
      // "pumping": the volume visibly dipped and swelled mid-sentence.
      // This is a light touch that only reins in genuinely loud peaks.
      compressor.threshold.value = -18;
      compressor.knee.value = 8;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.02;
      compressor.release.value = 0.35;
      const gain = audioCtxRef.current.createGain();
      gain.gain.value = 1.08;
      source.connect(compressor);
      compressor.connect(gain);
      gain.connect(audioCtxRef.current.destination);
      audioGraphRef.current = { source, compressor, gain };
    } catch (err) {
      console.error("Audio normalization graph unavailable, playing back unprocessed:", err);
    }
  }

  async function sendTurn(audioBlob) {
    setStatus("processing");
    try {
      const form = new FormData();
      form.append("history", JSON.stringify(historyRef.current));
      form.append("conversationId", conversationIdRef.current);
      form.append("startedAt", startedAtRef.current);
      if (audioBlob) {
        const ext = audioBlob.type.includes("mp4") ? "mp4" : audioBlob.type.includes("ogg") ? "ogg" : "webm";
        form.append("audio", audioBlob, `answer.${ext}`);
      }

      const res = await fetch("/api/turn", { method: "POST", body: form });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      historyRef.current = data.history;
      setIsMock(!!data.mock);
      setLastReplyText(data.replyText || "");

      const afterSpeaking = () => {
        if (data.done) {
          router.push("/thank-you");
        } else {
          startRecording();
        }
      };

      if (data.replyAudioBase64 && audioRef.current) {
        ensureAudioGraph();
        if (audioCtxRef.current?.state === "suspended") {
          audioCtxRef.current.resume().catch(() => {});
        }
        const src = `data:audio/mp3;base64,${data.replyAudioBase64}`;
        audioRef.current.src = src;
        lastReplyAudioSrcRef.current = src;
        audioRef.current.onended = afterSpeaking;
        setStatus("ai_speaking");
        await audioRef.current.play();
      } else if (data.mock && typeof window !== "undefined" && window.speechSynthesis) {
        lastReplyAudioSrcRef.current = null;
        setStatus("ai_speaking");
        const utterance = new SpeechSynthesisUtterance(data.replyText);
        const maleVoice = pickMaleSystemVoice();
        if (maleVoice) utterance.voice = maleVoice;
        utterance.pitch = 0.85;
        utterance.onend = afterSpeaking;
        utterance.onerror = afterSpeaking;
        window.speechSynthesis.speak(utterance);
      } else {
        lastReplyAudioSrcRef.current = null;
        afterSpeaking();
      }
    } catch (err) {
      console.error("Turn failed:", err);
      setError("Something went wrong. Please reload and try again.");
      setStatus("error");
    }
  }

  useEffect(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, []);

  useEffect(() => {
    return () => {
      stopSilenceWatcher();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStart() {
    // Create (and resume) the shared AudioContext synchronously inside this
    // tap handler, before any await. iOS Safari only allows audio contexts
    // to start from a direct user gesture - creating one later (e.g. after
    // the AI finishes speaking) reliably gets stuck "suspended" on iPhone.
    if (!audioCtxRef.current) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        try {
          audioCtxRef.current = new AudioContextClass();
          audioCtxRef.current.resume?.().catch(() => {});
        } catch (err) {
          console.error("AudioContext unavailable:", err);
        }
      }
    }

    try {
      if (audioRef.current) {
        audioRef.current.src = SILENT_AUDIO_SRC;
        await audioRef.current.play();
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    } catch {
      // Best-effort unlock only - harmless if the browser rejects it.
    }

    setMicState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      setMicState("granted");

      // Wire up the analyser once, off the same persistent stream, instead
      // of tearing it down and rebuilding it every single recording round.
      if (audioCtxRef.current) {
        try {
          const source = audioCtxRef.current.createMediaStreamSource(stream);
          const analyser = audioCtxRef.current.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
          analyserRef.current = analyser;
        } catch (err) {
          console.error("Silence detection unavailable, falling back to manual button only:", err);
        }
      }

      if (!startedConversationRef.current) {
        startedConversationRef.current = true;
        sendTurn(null);
      }
    } catch {
      setMicState("denied");
    }
  }

  function startRecording() {
    if (!streamRef.current) return;
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    chunksRef.current = [];
    const mimeType = pickMimeType();
    const recorderOptions = mimeType ? { mimeType, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 };
    let recorder;
    try {
      recorder = new MediaRecorder(streamRef.current, recorderOptions);
    } catch {
      // Some browsers reject audioBitsPerSecond/mimeType combos - fall back
      // to letting the browser pick its own defaults rather than failing.
      recorder = new MediaRecorder(streamRef.current);
    }

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
      sendTurn(blob);
    };

    recorderRef.current = recorder;
    // Periodic timeslice (instead of one giant chunk on stop) is more
    // reliable across mobile browsers, some of which handle very long
    // single MediaRecorder chunks poorly.
    recorder.start(250);
    setStatus("recording");
    startSilenceWatcher();
  }

  function stopRecording() {
    stopSilenceWatcher();
    recorderRef.current?.stop();
  }

  function startSilenceWatcher() {
    stopSilenceWatcher();
    if (!analyserRef.current) return;

    const analyser = analyserRef.current;
    const data = new Uint8Array(analyser.fftSize);
    const recordingStartedAt = Date.now();
    let hasSpoken = false;
    let lastLoudAt = Date.now();

    silenceIntervalRef.current = setInterval(() => {
      if (!recorderRef.current || recorderRef.current.state !== "recording") return;

      analyser.getByteTimeDomainData(data);
      let sumSquares = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / data.length);
      const now = Date.now();
      const elapsed = now - recordingStartedAt;

      if (rms > SILENCE_RMS_THRESHOLD) {
        lastLoudAt = now;
        hasSpoken = true;
      }

      if (elapsed >= MAX_RECORDING_MS) {
        stopRecording();
        return;
      }

      if (hasSpoken && elapsed >= MIN_SPEAKING_MS_BEFORE_AUTOSTOP && now - lastLoudAt >= SILENCE_DURATION_MS) {
        stopRecording();
      }
    }, 200);
  }

  function stopSilenceWatcher() {
    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
  }

  function repeatLastReply() {
    if (typeof window === "undefined") return;
    if (lastReplyAudioSrcRef.current) {
      const replay = new Audio(lastReplyAudioSrcRef.current);
      replay.play().catch(() => {});
    } else if (isMock && window.speechSynthesis && lastReplyText) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(lastReplyText);
      const maleVoice = pickMaleSystemVoice();
      if (maleVoice) utterance.voice = maleVoice;
      utterance.pitch = 0.85;
      window.speechSynthesis.speak(utterance);
    }
  }

  function togglePause() {
    if (status === "ai_speaking") {
      if (!isPaused) {
        audioRef.current?.pause();
        if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.pause();
        setIsPaused(true);
      } else {
        audioRef.current?.play();
        if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.resume();
        setIsPaused(false);
      }
    } else if (status === "recording") {
      if (!isPaused) {
        recorderRef.current?.pause();
        setIsPaused(true);
      } else {
        recorderRef.current?.resume();
        setIsPaused(false);
      }
    }
  }

  function stopEverything() {
    stopSilenceWatcher();
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.pause();
      audioRef.current.src = "";
    }
    if (typeof window !== "undefined" && window.speechSynthesis) window.speechSynthesis.cancel();
    setIsPaused(false);
  }

  function restartConversation() {
    if (typeof window !== "undefined" && !window.confirm("Start over from the beginning?")) return;
    stopEverything();
    historyRef.current = [];
    conversationIdRef.current =
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    startedAtRef.current = new Date().toISOString();
    setError(null);
    setLastReplyText("");
    setStatus("loading");
    sendTurn(null);
  }

  function exitInterview() {
    stopEverything();
    router.push("/");
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") exitInterview();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let content;

  if (micState === "idle") {
    content = (
      <main className="screen">
        <img className="mascot" src="/woodworking-guy.webp" alt="The Woodworking Guy" />
        <h1>Hey, builder!</h1>
        <p className="subtitle">
          I&apos;m The Woodworking Guy. Finished your project? I&apos;d love
          to hear all about it. Tap below, allow microphone access, and
          I&apos;ll ask you a few quick questions about your build.
        </p>
        <button className="primary" onClick={handleStart}>
          Start Talking
        </button>
      </main>
    );
  } else if (micState === "denied") {
    content = (
      <main className="screen">
        <img className="mascot" src="/woodworking-guy.webp" alt="The Woodworking Guy" />
        <h1>I need to hear you!</h1>
        <p className="subtitle">
          Please allow microphone access in your browser so I can hear you
          talk about your project, then reload this page.
        </p>
        <button className="end-link" onClick={() => router.push("/")}>Exit</button>
      </main>
    );
  } else if (status === "error") {
    content = (
      <main className="screen">
        <img className="mascot" src="/woodworking-guy.webp" alt="The Woodworking Guy" />
        <h1>Oops</h1>
        <div className="error-box">{error}</div>
        <button className="end-link" onClick={() => router.push("/")}>Exit</button>
      </main>
    );
  } else {
    content = (
      <main className="screen">
        {isMock && (
          <div className="mock-badge">
            🧪 MOCK MODE — fake replies, real speech isn&apos;t being listened to (that&apos;s the
            part that costs money). Turn this off once you add an OpenAI key.
          </div>
        )}
        <img className="mascot" src="/woodworking-guy.webp" alt="The Woodworking Guy" />
        <h1>
          {(status === "loading" || micState === "requesting") && "One sec..."}
          {status === "ai_speaking" && "The Woodworking Guy is talking..."}
          {status === "recording" && "I'm listening..."}
          {status === "processing" && "Thinking..."}
        </h1>

        {lastReplyText && (status === "ai_speaking" || status === "recording") && (
          <p className="subtitle" style={{ fontStyle: "italic" }}>
            &ldquo;{lastReplyText}&rdquo;
          </p>
        )}

        {status === "recording" && (
          <button className="primary" onClick={stopRecording}>
            ⏹ Tap When You're Done
          </button>
        )}

        {(status === "processing" || status === "ai_speaking" || status === "loading") && (
          <div className="status-pill">
            <span className={`dot ${status === "processing" ? "listening" : "speaking"}`} />
            {status === "processing" ? "Working on it..." : "Listen up!"}
          </div>
        )}

        <div className="control-bar">
          {(status === "ai_speaking" || status === "recording") && (
            <button type="button" className="control-btn" onClick={togglePause}>
              <span className="control-icon">{isPaused ? "▶" : "⏸"}</span>
              {isPaused ? "Resume" : "Pause"}
            </button>
          )}
          {status === "recording" && (
            <button type="button" className="control-btn" onClick={repeatLastReply}>
              <span className="control-icon">🔁</span>
              Repeat Question
            </button>
          )}
          <button type="button" className="control-btn" onClick={restartConversation}>
            <span className="control-icon">↺</span>
            Start Over
          </button>
          <button type="button" className="control-btn exit-btn" onClick={exitInterview}>
            <span className="control-icon">✕</span>
            Exit
          </button>
        </div>
      </main>
    );
  }

  // A single, stable <audio> element for the whole component lifetime -
  // it used to be duplicated inside each branch above, which meant React
  // swapped in a brand new DOM node every time the screen changed. That
  // silently broke the Web Audio normalization graph (a MediaElementSource
  // can only ever be attached to one specific element) and risked losing
  // playback state mid-transition.
  return (
    <>
      {content}
      <audio ref={audioRef} style={{ display: "none" }} />
    </>
  );
}
