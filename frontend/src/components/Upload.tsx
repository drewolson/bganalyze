import { useCallback, useRef, useState } from "react";

const SUPPORTED_EXTENSIONS = [".mat", ".sgf", ".gam", ".sgg", ".tmg", ".txt"];
const ACCEPT = SUPPORTED_EXTENSIONS.join(",");

interface UploadProps {
  onUpload: (matchID: string, ply: number) => void;
}

export default function Upload({ onUpload }: UploadProps) {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [ply, setPly] = useState(2);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);

      const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        setError("Unsupported file type");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("ply", String(ply));

      try {
        const resp = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!resp.ok) {
          const text = await resp.text();
          setError(text || "Upload failed");
          return;
        }

        const data = await resp.json();
        onUpload(data.matchID, ply);
      } catch {
        setError("Upload failed");
      }
    },
    [onUpload, ply],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setDragging(false), []);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 15 }}>
          Analysis depth:{" "}
          <select value={ply} onChange={(e) => setPly(Number(e.target.value))} style={{ fontSize: 15, padding: "4px 6px" }}>
            {[0, 1, 2, 3, 4].map((p) => (
              <option key={p} value={p}>{p} ply{p === 2 ? " (default)" : ""}</option>
            ))}
          </select>
        </label>
      </div>
      <div
        data-testid="drop-zone"
        onClick={() => inputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        style={{
          border: `2px dashed ${dragging ? "#333" : "#aaa"}`,
          borderRadius: 8,
          padding: "48px 32px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? "#f0f0f0" : "transparent",
        }}
      >
        <p style={{ fontSize: 15 }}>Drop a match file here or click to browse</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          onChange={onChange}
          style={{ display: "none" }}
        />
      </div>
      {error && (
        <p data-testid="upload-error" style={{ color: "red", marginTop: 8 }}>
          {error}
        </p>
      )}
    </div>
  );
}
