import { Upload } from 'lucide-react'

export default function UploadZone({ formats, busy, onChoose, onBrowse }: { formats: string; busy: boolean; onChoose: (files: File[]) => void; onBrowse: () => void }) {
  return <button type="button" className="dropzone signature-dropzone" onClick={onBrowse} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); onChoose(Array.from(event.dataTransfer.files)) }}>
    <span className="upload-icon"><Upload size={22}/></span>
    <strong>{busy ? 'Opening your image…' : 'Choose an image'}</strong>
    <small>{formats} · up to 30 MB</small>
    <span className="browse-files">Browse files</span>
  </button>
}
