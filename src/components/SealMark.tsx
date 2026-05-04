type Props = {
  issue: string | number;
  size?: number;
  className?: string;
};

export default function SealMark({
  issue,
  size = 156,
  className,
}: Props) {
  const padded = String(issue).padStart(3, "0");
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={`seal-mark ${className ?? ""}`.trim()}
      aria-hidden="true"
    >
      <defs>
        <path
          id="seal-arc-top"
          d="M 30,100 a 70,70 0 1,1 140,0"
        />
        <path
          id="seal-arc-bottom"
          d="M 30,100 a 70,70 0 1,0 140,0"
        />
      </defs>

      {/* outer ring */}
      <circle
        cx="100"
        cy="100"
        r="78"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle
        cx="100"
        cy="100"
        r="73"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.6"
        strokeDasharray="1.5 2.4"
      />

      {/* circular legend */}
      <text
        fill="currentColor"
        fontFamily="var(--font-mono)"
        fontSize="9.5"
        letterSpacing="3.4"
      >
        <textPath href="#seal-arc-top" startOffset="50%" textAnchor="middle">
          THE PREYAM BROADSHEET
        </textPath>
      </text>
      <text
        fill="currentColor"
        fontFamily="var(--font-mono)"
        fontSize="8"
        letterSpacing="3"
      >
        <textPath href="#seal-arc-bottom" startOffset="50%" textAnchor="middle">
          BENGALURU · MMXXVI ·
        </textPath>
      </text>

      {/* inner mark */}
      <circle
        cx="100"
        cy="100"
        r="42"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.8"
      />
      <text
        x="100"
        y="92"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="var(--font-display)"
        fontStyle="italic"
        fontSize="32"
      >
        PR
      </text>
      <text
        x="100"
        y="115"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="var(--font-mono)"
        fontSize="7"
        letterSpacing="2.5"
      >
        EDITION
      </text>
      <text
        x="100"
        y="128"
        textAnchor="middle"
        fill="currentColor"
        fontFamily="var(--font-mono)"
        fontSize="11"
        letterSpacing="2"
        fontWeight="500"
      >
        Nº {padded}
      </text>

      {/* decorative corner stars */}
      <text
        x="22"
        y="106"
        textAnchor="middle"
        fill="currentColor"
        fontSize="10"
      >
        ✦
      </text>
      <text
        x="178"
        y="106"
        textAnchor="middle"
        fill="currentColor"
        fontSize="10"
      >
        ✦
      </text>
    </svg>
  );
}
