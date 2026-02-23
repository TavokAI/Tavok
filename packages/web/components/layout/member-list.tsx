"use client";

const placeholderMembers = {
  online: [
    { id: "1", name: "Alice", color: "#f59e0b" },
    { id: "2", name: "HiveBot", color: "#23a559" },
  ],
  offline: [
    { id: "3", name: "Bob", color: "#80848e" },
    { id: "4", name: "Charlie", color: "#80848e" },
  ],
};

function MemberItem({
  name,
  color,
  online,
}: {
  name: string;
  color: string;
  online: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded px-2 py-1.5 transition hover:bg-background-primary">
      <div className="relative flex-shrink-0">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-background-floating"
          style={{ backgroundColor: color }}
        >
          {name.charAt(0).toUpperCase()}
        </div>
        <div
          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background-secondary ${
            online ? "bg-status-online" : "bg-status-offline"
          }`}
        />
      </div>
      <span
        className={`truncate text-sm ${
          online ? "text-text-primary" : "text-text-muted"
        }`}
      >
        {name}
      </span>
    </div>
  );
}

export function MemberList() {
  return (
    <div className="hidden w-60 flex-col bg-background-secondary lg:flex">
      <div className="flex-1 overflow-y-auto px-2 pt-6">
        {/* Online section */}
        <p className="mb-2 px-2 text-xs font-bold uppercase text-text-muted">
          Online — {placeholderMembers.online.length}
        </p>
        {placeholderMembers.online.map((member) => (
          <MemberItem
            key={member.id}
            name={member.name}
            color={member.color}
            online
          />
        ))}

        {/* Offline section */}
        <p className="mb-2 mt-4 px-2 text-xs font-bold uppercase text-text-muted">
          Offline — {placeholderMembers.offline.length}
        </p>
        {placeholderMembers.offline.map((member) => (
          <MemberItem
            key={member.id}
            name={member.name}
            color={member.color}
            online={false}
          />
        ))}
      </div>
    </div>
  );
}
