"use client";

const placeholderServers = [
  { id: "1", name: "HiveChat", icon: "H" },
  { id: "2", name: "Dev Team", icon: "D" },
  { id: "3", name: "General", icon: "G" },
];

export function ServerSidebar() {
  return (
    <div className="flex w-[72px] flex-col items-center gap-2 bg-background-tertiary py-3">
      {/* Home button */}
      <button className="flex h-12 w-12 items-center justify-center rounded-2xl bg-background-primary text-brand transition-all hover:rounded-xl hover:bg-brand hover:text-background-floating">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M2.3 7.7L11.3 2.2C11.7 2 12.3 2 12.7 2.2L21.7 7.7C22.1 7.9 22.1 8.5 21.7 8.7L12.7 14.2C12.3 14.4 11.7 14.4 11.3 14.2L2.3 8.7C1.9 8.5 1.9 7.9 2.3 7.7Z" />
          <path d="M2.3 11.7L11.3 17.2C11.7 17.4 12.3 17.4 12.7 17.2L21.7 11.7" strokeWidth="2" stroke="currentColor" fill="none" />
          <path d="M2.3 15.7L11.3 21.2C11.7 21.4 12.3 21.4 12.7 21.2L21.7 15.7" strokeWidth="2" stroke="currentColor" fill="none" />
        </svg>
      </button>

      {/* Divider */}
      <div className="mx-auto h-[2px] w-8 rounded-full bg-background-primary" />

      {/* Server icons */}
      {placeholderServers.map((server) => (
        <button
          key={server.id}
          title={server.name}
          className="flex h-12 w-12 items-center justify-center rounded-3xl bg-background-primary text-text-primary transition-all hover:rounded-xl hover:bg-brand hover:text-background-floating"
        >
          <span className="text-lg font-semibold">{server.icon}</span>
        </button>
      ))}

      {/* Add server button */}
      <button className="flex h-12 w-12 items-center justify-center rounded-3xl bg-background-primary text-status-online transition-all hover:rounded-xl hover:bg-status-online hover:text-white">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
          <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
        </svg>
      </button>
    </div>
  );
}
