import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  MessageSquare,
  Mic,
  Pause,
  Play,
  Send,
  ShieldAlert,
  Square,
  Trash2,
  Volume2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useLiveChat } from '../hooks/useLiveChat.ts';
import type { ChatMessage, ServiceContractRecord } from '../types/nearestyou.ts';
import { formatLastSeenStatus } from '../utils/presence.ts';

interface LiveChatPanelProps {
  threadKey: string;
  businessId?: number | null;
  listingId?: number | null;
  orderId?: number | null;
  bookingId?: number | null;
  recipientUid?: string | null;
  title?: string;
  maskedTitle?: string;
  revealTitleOnMessage?: boolean;
  subtitle?: string;
  initialLastSeenAt?: string | null;
  initialActiveLastMinute?: boolean;
  placeholder?: string;
  compact?: boolean;
  onClose?: () => void;
  onMessageSent?: (text: string) => void;
  onMessageSentOrReceived?: (msg: ChatMessage) => void;
  onContractUpdated?: (contract: ServiceContractRecord) => void;
}

const MAX_RECORDING_SECONDS = 60;

function formatDurationClock(totalSeconds: number | null | undefined): string {
  const safe = Math.max(0, Math.round(totalSeconds || 0));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
        resolve(reader.result);
      } else {
        reject(new Error('Could not encode audio recording.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read recorded audio.'));
    reader.readAsDataURL(blob);
  });
}

interface VoiceMessageBubbleProps {
  audioDataUrl: string;
  durationSeconds?: number | null;
  isMine: boolean;
}

const VoiceMessageBubble: React.FC<VoiceMessageBubbleProps> = ({
  audioDataUrl,
  durationSeconds,
  isMine,
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [resolvedDuration, setResolvedDuration] = useState<number>(durationSeconds || 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setResolvedDuration(Math.round(audio.duration));
      }
    };
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime || 0);
    };
    const handleEnded = () => {
      setPlaying(false);
      setCurrentTime(0);
    };
    const handlePause = () => setPlaying(false);
    const handlePlay = () => setPlaying(true);

    audio.addEventListener('loadedmetadata', handleLoaded);
    audio.addEventListener('durationchange', handleLoaded);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoaded);
      audio.removeEventListener('durationchange', handleLoaded);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
    };
  }, [audioDataUrl]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      try {
        await audio.play();
      } catch {
        setPlaying(false);
      }
    }
  };

  const totalSec = resolvedDuration > 0 ? resolvedDuration : durationSeconds || 1;
  const progressPct = Math.min(100, Math.max(0, (currentTime / Math.max(1, totalSec)) * 100));

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
    setCurrentTime(audio.currentTime);
  };

  return (
    <div className="flex min-w-[190px] max-w-[260px] items-center gap-2.5">
      <audio ref={audioRef} src={audioDataUrl} preload="metadata" className="hidden" />
      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
          isMine
            ? 'bg-white/20 text-white hover:bg-white/30'
            : 'bg-[#176B52] text-white hover:bg-[#125641]'
        }`}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          onClick={handleSeek}
          role="progressbar"
          aria-valuenow={Math.round(progressPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          className={`relative h-2 w-full cursor-pointer overflow-hidden rounded-full ${
            isMine ? 'bg-white/25' : 'bg-slate-200'
          }`}
        >
          <div
            className={`h-full rounded-full transition-all ${
              isMine ? 'bg-emerald-200' : 'bg-[#176B52]'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div
          className={`mt-1 flex items-center justify-between text-[10px] font-medium ${
            isMine ? 'text-emerald-100' : 'text-slate-500'
          }`}
        >
          <span className="inline-flex items-center gap-1">
            <Volume2 className="h-3 w-3" />
            Voice
          </span>
          <span>
            {playing
              ? `${formatDurationClock(currentTime)} / ${formatDurationClock(totalSec)}`
              : formatDurationClock(totalSec)}
          </span>
        </div>
      </div>
    </div>
  );
};

export const LiveChatPanel: React.FC<LiveChatPanelProps> = ({
  threadKey,
  businessId,
  listingId,
  orderId,
  bookingId,
  recipientUid,
  title = 'Live Chat',
  maskedTitle,
  revealTitleOnMessage = false,
  subtitle,
  initialLastSeenAt = null,
  initialActiveLastMinute = false,
  placeholder = 'Write a message to reply...',
  compact = false,
  onClose,
  onMessageSent,
  onMessageSentOrReceived,
  onContractUpdated,
}) => {
  const { dbUser, firebaseUser, openAuthModal } = useAuth();
  const [draft, setDraft] = useState('');
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [voiceLevels, setVoiceLevels] = useState<number[]>([25, 45, 35, 60, 30, 50, 40]);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [sendingVoice, setSendingVoice] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingStartMsRef = useRef<number>(0);
  const recordingTimerRef = useRef<number | null>(null);
  const levelRafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const cancelRecordingRef = useRef(false);
  const pressStartedAtRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const isSelfRecipient = Boolean(
    recipientUid &&
      ((dbUser?.uid && recipientUid === dbUser.uid) ||
        (firebaseUser?.uid && recipientUid === firebaseUser.uid))
  );

  const { messages, partnerPresence, loading, sending, connected, error, sendMessage, sendVoiceMessage } =
    useLiveChat({
      threadKey,
      businessId,
      listingId,
      orderId,
      bookingId,
      recipientUid,
      enabled: Boolean(dbUser && threadKey && !isSelfRecipient),
      onMessageReceived: onMessageSentOrReceived,
      onContractUpdated,
    });

  const releaseRecorderResources = useCallback(() => {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (levelRafRef.current !== null) {
      window.cancelAnimationFrame(levelRafRef.current);
      levelRafRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        /* ignore */
      }
      audioCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      });
      mediaStreamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const id = window.setInterval(() => setNowTick(Date.now()), 15000);
    return () => {
      mountedRef.current = false;
      window.clearInterval(id);
      cancelRecordingRef.current = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      releaseRecorderResources();
    };
  }, [releaseRecorderResources]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, threadKey]);

  const stopAndSendRecording = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state === 'inactive') return;
    cancelRecordingRef.current = false;
    try {
      rec.stop();
    } catch {
      releaseRecorderResources();
      if (mountedRef.current) setIsRecording(false);
    }
  }, [releaseRecorderResources]);

  const cancelRecording = useCallback(() => {
    cancelRecordingRef.current = true;
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    releaseRecorderResources();
    if (mountedRef.current) {
      setIsRecording(false);
      setRecordingSeconds(0);
    }
  }, [releaseRecorderResources]);

  const startAutoRecording = useCallback(async () => {
    if (isRecording || sending || sendingVoice || isSelfRecipient) return;
    setVoiceError(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setVoiceError('Voice recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      mediaStreamRef.current = stream;
      audioChunksRef.current = [];
      cancelRecordingRef.current = false;

      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ];
      const chosenMime = preferredTypes.find((type) => {
        try {
          return typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(type);
        } catch {
          return false;
        }
      });

      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime, audioBitsPerSecond: 24000 })
        : new MediaRecorder(stream, { audioBitsPerSecond: 24000 });

      mediaRecorderRef.current = recorder;
      recordingStartMsRef.current = Date.now();
      setIsRecording(true);
      setRecordingSeconds(0);

      // Visual voice level meter
      try {
        const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextCtor) {
          const ctx = new AudioContextCtor();
          audioCtxRef.current = ctx;
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 32;
          source.connect(analyser);
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          let lastSample = 0;

          const tickLevel = (ts: number) => {
            if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return;
            if (ts - lastSample > 90) {
              lastSample = ts;
              analyser.getByteFrequencyData(dataArray);
              const bars = Array.from({ length: 7 }, (_, i) => {
                const raw = dataArray[i % dataArray.length] || 0;
                return Math.max(18, Math.min(100, Math.round((raw / 255) * 100) + 18));
              });
              if (mountedRef.current) setVoiceLevels(bars);
            }
            levelRafRef.current = window.requestAnimationFrame(tickLevel);
          };
          levelRafRef.current = window.requestAnimationFrame(tickLevel);
        }
      } catch {
        /* fallback static animation bars handled gracefully */
      }

      recordingTimerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - recordingStartMsRef.current) / 1000);
        if (mountedRef.current) setRecordingSeconds(elapsed);
        if (elapsed >= MAX_RECORDING_SECONDS) {
          stopAndSendRecording();
        }
      }, 250);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const shouldCancel = cancelRecordingRef.current;
        const elapsedSec = Math.max(1, Math.round((Date.now() - recordingStartMsRef.current) / 1000));
        const chunks = [...audioChunksRef.current];
        const mimeType = recorder.mimeType || chosenMime || 'audio/webm';

        releaseRecorderResources();
        if (mountedRef.current) {
          setIsRecording(false);
          setRecordingSeconds(0);
        }

        if (shouldCancel) return;

        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size < 200) {
          if (mountedRef.current) {
            setVoiceError('Recording was too short. Speak briefly and try again.');
          }
          return;
        }

        if (mountedRef.current) setSendingVoice(true);
        try {
          const dataUrl = await blobToDataUrl(blob);
          const ok = await sendVoiceMessage(dataUrl, elapsedSec);
          if (ok) {
            onMessageSent?.(`Voice message (${formatDurationClock(elapsedSec)})`);
          }
        } catch (err: any) {
          if (mountedRef.current) {
            setVoiceError(err?.message || 'Could not send voice message.');
          }
        } finally {
          if (mountedRef.current) setSendingVoice(false);
        }
      };

      recorder.start(200);
    } catch (err: any) {
      releaseRecorderResources();
      if (mountedRef.current) {
        setIsRecording(false);
        setVoiceError(
          err?.name === 'NotAllowedError'
            ? 'Microphone permission denied. Allow mic access to send voice messages.'
            : 'Could not access microphone for automatic voice recording.'
        );
      }
    }
  }, [
    isRecording,
    sending,
    sendingVoice,
    isSelfRecipient,
    releaseRecorderResources,
    stopAndSendRecording,
    sendVoiceMessage,
    onMessageSent,
  ]);

  const handleMicPointerDown = () => {
    if (isRecording) return;
    pressStartedAtRef.current = Date.now();
    void startAutoRecording();
  };

  const handleMicPointerUp = () => {
    if (!isRecording) return;
    const heldMs = Date.now() - pressStartedAtRef.current;
    // Hold-to-talk (>450ms): releasing immediately stops & sends automatically.
    // Quick tap (<450ms): stays recording until user taps Stop & Send.
    if (heldMs > 450) {
      stopAndSendRecording();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || sending || sendingVoice || isSelfRecipient) return;
    const text = draft;
    setDraft('');
    const ok = await sendMessage(text);
    if (!ok) {
      setDraft(text);
    } else {
      onMessageSent?.(text.trim());
    }
  };

  const displayHeaderTitle =
    revealTitleOnMessage && messages.length === 0 && maskedTitle ? maskedTitle : title;

  const effectiveLastSeen = partnerPresence?.lastSeenAt ?? initialLastSeenAt;
  const effectiveActiveLastMinute =
    partnerPresence !== null ? partnerPresence.isActiveLastMinute : initialActiveLastMinute;
  const presenceDisplay = formatLastSeenStatus(effectiveLastSeen, effectiveActiveLastMinute, nowTick);

  if (!dbUser) {
    return (
      <div className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center sm:p-5">
        <MessageSquare className="mx-auto mb-2 h-8 w-8 text-[#176B52]" />
        <p className="text-sm font-bold text-[#172B3A]">Sign in to contact & start live chat</p>
        <p className="mt-1 text-xs text-slate-600">
          Direct messages, voice notes, and instant replies are synced to your account.
        </p>
        <button
          type="button"
          onClick={() => openAuthModal('signin')}
          className="mt-3 rounded-lg bg-[#176B52] px-4 py-2 text-xs font-bold text-white hover:bg-[#125541]"
        >
          Sign In / Sign Up
        </button>
      </div>
    );
  }

  if (isSelfRecipient) {
    return (
      <div className="w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center sm:p-5">
        <ShieldAlert className="mx-auto mb-2 h-7 w-7 text-[#176B52]" />
        <p className="text-xs font-bold text-[#172B3A]">You created this advertisement</p>
        <p className="mt-1 text-[11px] text-slate-600">
          Sending messages to yourself is disabled. Client inquiries appear in your Messages inbox.
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex w-full min-w-0 items-center justify-between gap-2 border-b border-slate-200 bg-[#172B3A] px-3 py-2.5 text-white sm:px-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <MessageSquare className="h-4 w-4 shrink-0 text-emerald-300" />
            <h4 className="truncate text-xs font-bold sm:text-sm">{displayHeaderTitle}</h4>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-300">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <span
                aria-hidden="true"
                className={`h-2 w-2 shrink-0 rounded-full ${
                  presenceDisplay.isActiveNow ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <span className={presenceDisplay.isActiveNow ? 'text-emerald-200 font-semibold' : ''}>
                {presenceDisplay.label}
              </span>
            </span>
            {subtitle && (
              <>
                <span aria-hidden="true" className="text-slate-500">·</span>
                <span className="truncate">{subtitle}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
              connected
                ? 'bg-emerald-500/20 text-emerald-200'
                : 'bg-amber-500/20 text-amber-200'
            }`}
          >
            {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
            {connected ? 'Live' : 'Connecting'}
          </span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close live chat"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages Feed */}
      <div
        ref={scrollRef}
        className={`w-full min-w-0 flex-1 space-y-2.5 overflow-x-hidden overflow-y-auto bg-slate-50 p-3 sm:p-3.5 ${
          compact ? 'h-52 sm:h-56' : 'h-64 sm:h-80'
        }`}
      >
        {loading && messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-500">
            Loading conversation...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-3 text-center">
            <MessageSquare className="mb-2 h-7 w-7 text-slate-300" />
            <p className="text-xs font-semibold text-slate-600">No messages yet</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Write a message or tap the mic button to record & auto-send a voice note.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.senderUid === dbUser.uid;
            const roleLabel =
              msg.senderRole === 'PROVIDER'
                ? 'Provider'
                : msg.senderRole === 'ADMIN'
                  ? 'Admin'
                  : 'Customer';
            const timeStr = new Date(msg.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });
            const isVoice = msg.messageType === 'VOICE' || Boolean(msg.audioDataUrl);

            return (
              <div
                key={msg.id}
                className={`flex w-full min-w-0 flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div className="mb-0.5 flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-slate-500">
                  <span className="truncate font-semibold text-slate-700">
                    {isMine ? 'You' : msg.senderName}
                  </span>
                  <span className="rounded bg-slate-200/80 px-1 py-0.2 font-semibold text-slate-600">
                    {roleLabel}
                  </span>
                  <span className="shrink-0">{timeStr}</span>
                </div>
                <div
                  className={`max-w-[88%] min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-xl px-3 py-2 text-xs leading-relaxed shadow-xs sm:max-w-[85%] sm:px-3.5 ${
                    isMine
                      ? 'rounded-tr-sm bg-[#176B52] text-white'
                      : 'rounded-tl-sm border border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  {isVoice && msg.audioDataUrl ? (
                    <VoiceMessageBubble
                      audioDataUrl={msg.audioDataUrl}
                      durationSeconds={msg.audioDurationSeconds}
                      isMine={isMine}
                    />
                  ) : (
                    msg.body
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Error Notice */}
      {(error || voiceError) && (
        <div className="border-t border-red-200 bg-red-50 px-3 py-1.5 text-[11px] font-medium text-red-700 break-words">
          {voiceError || error}
        </div>
      )}

      {/* Composer or Active Auto Voice Recording Bar */}
      {isRecording ? (
        <div className="flex w-full min-w-0 items-center justify-between gap-2 border-t border-rose-200 bg-rose-50 px-2.5 py-2 sm:px-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 animate-ping rounded-full bg-rose-600" />
            <span className="shrink-0 font-mono text-xs font-bold text-rose-800">
              {formatDurationClock(recordingSeconds)}
            </span>
            <div className="hidden items-end gap-0.5 sm:flex" aria-hidden="true">
              {voiceLevels.map((lvl, idx) => (
                <span
                  key={idx}
                  className="w-1 rounded-full bg-rose-500 transition-all duration-100"
                  style={{ height: `${Math.max(5, Math.round((lvl / 100) * 18))}px` }}
                />
              ))}
            </div>
            <span className="truncate text-[11px] font-semibold text-rose-700">
              Recording voice...
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={cancelRecording}
              title="Discard recording"
              className="inline-flex items-center gap-1 rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Cancel</span>
            </button>
            <button
              type="button"
              onClick={stopAndSendRecording}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#176B52] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#125641]"
            >
              <Square className="h-3 w-3 fill-current" />
              <span>Stop &amp; Send</span>
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="flex w-full min-w-0 items-center gap-1.5 border-t border-slate-200 bg-white p-2 sm:gap-2 sm:p-2.5"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={sendingVoice ? 'Sending voice message...' : placeholder}
            disabled={sending || sendingVoice}
            className="min-w-0 w-full flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#176B52] focus:bg-white focus:outline-none"
          />
          <button
            type="button"
            onPointerDown={handleMicPointerDown}
            onPointerUp={handleMicPointerUp}
            disabled={sending || sendingVoice}
            title="Tap to record & auto-send voice message (or hold and release)"
            aria-label="Record and send voice message automatically"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 text-[#172B3A] transition hover:border-[#176B52] hover:bg-emerald-50 hover:text-[#176B52] disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:w-9"
          >
            <Mic className="h-4 w-4" />
          </button>
          <button
            type="submit"
            disabled={sending || sendingVoice || !draft.trim()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#176B52] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#125641] disabled:cursor-not-allowed disabled:opacity-50 sm:px-3.5"
          >
            <Send className="h-3.5 w-3.5" />
            <span>{sending || sendingVoice ? 'Sending...' : 'Send'}</span>
          </button>
        </form>
      )}
    </div>
  );
};
