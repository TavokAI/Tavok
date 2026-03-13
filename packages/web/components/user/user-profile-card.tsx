"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { passthroughImageLoader } from "@/lib/image-loader";
import { MessageSquare, X } from "lucide-react";

interface UserProfileData {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  createdAt: string;
}

interface UserProfileCardProps {
  userId: string;
  /** Anchor position for the popover */
  anchorRect: { top: number; left: number };
  onClose: () => void;
}

function statusColor(status: string) {
  switch (status) {
    case "online":
      return "bg-status-online";
    case "away":
      return "bg-status-idle";
    case "busy":
      return "bg-status-dnd";
    case "invisible":
      return "bg-status-offline";
    default:
      return "bg-status-online";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "online":
      return "Online";
    case "away":
      return "Away";
    case "busy":
      return "Do Not Disturb";
    case "invisible":
      return "Offline";
    default:
      return "Online";
  }
}

export function UserProfileCard({
  userId,
  anchorRect,
  onClose,
}: UserProfileCardProps) {
  const router = useRouter();
  const cardRef = useRef<HTMLDivElement>(null);
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingDm, setCreatingDm] = useState(false);

  // Fetch user profile
  useEffect(() => {
    let cancelled = false;
    async function fetchProfile() {
      try {
        const res = await fetch(`/api/users/${userId}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setProfile(data);
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Outside click to dismiss
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [onClose]);

  // Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSendMessage = useCallback(async () => {
    if (creatingDm) return;
    setCreatingDm(true);
    try {
      const res = await fetch("/api/dms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        const data = await res.json();
        onClose();
        router.push(`/dms/${data.id}`);
      }
    } catch {
      // Silently fail
    } finally {
      setCreatingDm(false);
    }
  }, [userId, creatingDm, onClose, router]);

  // Position the card near the anchor
  const style: React.CSSProperties = {
    position: "fixed",
    top: Math.min(anchorRect.top, window.innerHeight - 320),
    left: Math.min(anchorRect.left + 8, window.innerWidth - 300),
    zIndex: 60,
  };

  return (
    <div
      ref={cardRef}
      style={style}
      className="w-72 rounded-lg border border-border bg-background-floating shadow-xl"
      data-testid="user-profile-card"
    >
      {loading ? (
        <div className="p-6 text-center text-sm text-text-muted">
          Loading...
        </div>
      ) : !profile ? (
        <div className="p-6 text-center text-sm text-text-muted">
          User not found
        </div>
      ) : (
        <>
          {/* Header with avatar */}
          <div className="relative p-4 pb-3">
            <button
              onClick={onClose}
              className="absolute right-2 top-2 rounded p-1 text-text-muted hover:bg-background-secondary hover:text-text-primary transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-white overflow-hidden">
                  {profile.avatarUrl ? (
                    <Image
                      src={profile.avatarUrl}
                      alt=""
                      loader={passthroughImageLoader}
                      unoptimized
                      width={56}
                      height={56}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    profile.displayName.charAt(0).toUpperCase()
                  )}
                </div>
                <div
                  className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-background-floating ${statusColor(profile.status)}`}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-text-primary">
                  {profile.displayName}
                </div>
                <div className="truncate text-xs text-text-muted">
                  @{profile.username}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-text-muted">
                  <div
                    className={`h-2 w-2 rounded-full ${statusColor(profile.status)}`}
                  />
                  {statusLabel(profile.status)}
                </div>
              </div>
            </div>
          </div>

          {/* Info section */}
          <div className="border-t border-border px-4 py-3">
            <div className="text-[10px] font-bold uppercase tracking-wide text-text-muted">
              Member Since
            </div>
            <div className="mt-0.5 text-xs text-text-secondary">
              {new Date(profile.createdAt).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="border-t border-border p-2">
            <button
              onClick={handleSendMessage}
              disabled={creatingDm}
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-background-secondary hover:text-text-primary"
              data-testid="profile-card-dm-btn"
            >
              <MessageSquare className="h-4 w-4" />
              {creatingDm ? "Opening..." : "Send Message"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
