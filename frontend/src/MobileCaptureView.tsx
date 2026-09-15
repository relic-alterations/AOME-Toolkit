import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import 'react-easy-crop/react-easy-crop.css';

export const MobileCaptureView = ({ sessionId, folderName }: { sessionId: string, folderName?: string }) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<any>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [success, setSuccess] = useState(false);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = () => setImageSrc(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const onCropComplete = useCallback((_croppedArea: any, croppedAreaPixels: any) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createCropCanvas = async (imageSrc: string, crop: any): Promise<Blob | null> => {
    const image = new Image();
    image.src = imageSrc;
    await new Promise(resolve => image.onload = resolve);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    canvas.width = crop.width;
    canvas.height = crop.height;

    // Draw circular mask (Disc Mode)
    ctx.beginPath();
    ctx.arc(crop.width / 2, crop.height / 2, crop.width / 2, 0, 2 * Math.PI);
    ctx.clip();
    
    // Draw background pattern (optional)
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      crop.width,
      crop.height
    );

    return new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob), 'image/jpeg', 0.9);
    });
  };

  const handleSave = async () => {
    if (!imageSrc || !croppedAreaPixels) return;
    setIsUploading(true);
    try {
      const blob = await createCropCanvas(imageSrc, croppedAreaPixels);
      if (!blob) throw new Error("Canvas failed");
      const formData = new FormData();
      formData.append('file', blob, 'capture.jpg');
      if (folderName) {
        formData.append('folder_name', folderName);
      }
      
      const host = window.location.hostname;
      const response = await fetch(`http://${host}:8000/media/capture/${sessionId}`, {
        method: 'POST',
        body: formData,
      });
      if (response.ok) {
        setSuccess(true);
      }
    } catch (e) {
      console.error(e);
      alert("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-4xl mb-4">✅ Success!</h1>
        <p className="text-xl text-gray-400">Your cover art has been sent to AOME.</p>
        <p className="mt-4">You can now close this tab on your phone.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col" style={{ overscrollBehavior: 'none' }}>
      <div className="p-4 bg-gray-900 border-b border-gray-800 flex justify-between items-center z-10">
        <h1 className="text-xl font-bold">AOME Scanner</h1>
      </div>

      <div className="flex-1 relative flex flex-col items-center justify-center p-4">
        {!imageSrc ? (
          <div className="text-center w-full max-w-sm">
            <div className="w-48 h-48 rounded-full border-4 border-dashed border-gray-600 flex items-center justify-center mx-auto mb-8 relative">
              <span className="text-6xl">📷</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={onFileChange}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              />
            </div>
            <h2 className="text-2xl font-bold mb-2">Tap to Scan Disc</h2>
            <p className="text-gray-400">Line up your disc in the frame on the next screen.</p>
          </div>
        ) : (
          <>
            <div className="absolute inset-0" style={{ touchAction: 'none', overscrollBehavior: 'none' }}>
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            </div>
            <div className="absolute bottom-8 left-0 right-0 flex justify-center z-[100]">
              <button 
                onClick={handleSave} 
                disabled={isUploading} 
                className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-4 rounded-full font-black text-xl shadow-[0_0_20px_rgba(37,99,235,0.5)] active:scale-95 transition-transform"
              >
                {isUploading ? 'Sending...' : 'Use Photo 🚀'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
