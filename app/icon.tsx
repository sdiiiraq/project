import { ImageResponse } from "next/og";

export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 40,
        }}
      >
        <svg width="120" height="120" viewBox="0 0 64 64">
          <path
            d="M20 46 L32 17 L44 46"
            fill="none"
            stroke="#facc15"
            strokeWidth="6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="24.5" y1="35" x2="39.5" y2="35" stroke="#facc15" strokeWidth="5" strokeLinecap="round" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
