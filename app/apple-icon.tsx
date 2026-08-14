import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #1c2333, #0e1220)",
        }}
      >
        <svg width="112" height="112" viewBox="0 0 64 64">
          <path
            d="M20 46 L32 17 L44 46"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="24.5" y1="35" x2="39.5" y2="35" stroke="#f59e0b" strokeWidth="5" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
