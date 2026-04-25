import React, { useRef, useEffect } from "react";

export default function Waveform({ getFrequencyData, isPlaying, color = "#6c47ff" }) {
    const canvasRef = useRef(null);
    const rafRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");

        const draw = () => {
            rafRef.current = requestAnimationFrame(draw);
            const data = getFrequencyData?.();
            const W = canvas.width;
            const H = canvas.height;
            ctx.clearRect(0, 0, W, H);

            if (!data || !isPlaying) {
                // Idle flat line
                ctx.strokeStyle = color + "44";
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(0, H / 2);
                ctx.lineTo(W, H / 2);
                ctx.stroke();
                return;
            }

            const barCount = 48;
            const step = Math.floor(data.length / barCount);
            const barW = W / barCount;

            for (let i = 0; i < barCount; i++) {
                const val = data[i * step] / 255;
                const barH = Math.max(2, val * H * 0.85);
                const x = i * barW + barW * 0.15;
                const y = (H - barH) / 2;

                const alpha = 0.3 + val * 0.7;
                ctx.fillStyle = color + Math.round(alpha * 255).toString(16).padStart(2, "0");
                ctx.beginPath();
                ctx.roundRect(x, y, barW * 0.7, barH, 2);
                ctx.fill();
            }
        };

        draw();
        return () => cancelAnimationFrame(rafRef.current);
    }, [getFrequencyData, isPlaying, color]);

    return (
        <canvas
            ref={canvasRef}
            width={320}
            height={64}
            style={{ width: "100%", height: "64px" }}
        />
    );
}