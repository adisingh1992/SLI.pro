interface DirectiveCardProps {
  title: string;
  description: string;
  note?: string;
  metaInfo?: string;
  buttonLabel?: string;
  onButtonClick?: () => void;
}

export default function DirectiveCard({
  title,
  description,
  note,
  metaInfo,
  buttonLabel = "Begin",
  onButtonClick,
}: DirectiveCardProps) {
  return (
    <div className="bg-white p-[60px] max-w-[900px] shadow-[0_20px_50px_rgba(0,0,0,0.03)] border border-[var(--dashboard-border)] relative">
      <h2 className="dashboard-heading text-[32px] font-normal mb-5 text-[var(--dashboard-void)]">
        {title}
      </h2>

      <p className="text-base leading-relaxed text-gray-500 mb-8 max-w-[700px]">
        {description}
      </p>

      {note && (
        <div className="note-box pl-6 my-10 text-sm leading-relaxed text-[var(--dashboard-void)]">
          <strong>Note:</strong> {note}
        </div>
      )}

      {metaInfo && (
        <div className="text-[10px] uppercase tracking-[2px] text-[var(--dashboard-aqua-dark)] font-semibold mt-5">
          {metaInfo}
        </div>
      )}

      {buttonLabel && (
        <button
          onClick={onButtonClick}
          className="btn-begin absolute bottom-[60px] right-[60px] bg-[var(--dashboard-void)] text-white border-none py-[22px] px-[60px] text-[11px] font-semibold uppercase tracking-[4px] cursor-pointer"
        >
          {buttonLabel}
        </button>
      )}
    </div>
  );
}
