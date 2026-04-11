/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Maximize2, Move, Trash2, Upload, Play, Pause, Volume2, VolumeX, Lock, Unlock, RefreshCw } from 'lucide-react';

interface Point {
  x: number;
  y: number;
}

interface VideoItem {
  id: string;
  url: string;
  corners: [Point, Point, Point, Point]; // TL, TR, BR, BL
  zIndex: number;
  isPaused: boolean;
  isMuted: boolean;
  originalWidth: number;
  originalHeight: number;
}

// Helper to calculate matrix3d for perspective transform
// Based on: https://github.com/jlouthan/perspective-transform
function getPerspectiveTransform(src: Point[], dst: Point[]) {
  const p1 = src;
  const p2 = dst;
  const a = [
    [p1[0].x, p1[0].y, 1, 0, 0, 0, -p2[0].x * p1[0].x, -p2[0].x * p1[0].y],
    [0, 0, 0, p1[0].x, p1[0].y, 1, -p2[0].y * p1[0].x, -p2[0].y * p1[0].y],
    [p1[1].x, p1[1].y, 1, 0, 0, 0, -p2[1].x * p1[1].x, -p2[1].x * p1[1].y],
    [0, 0, 0, p1[1].x, p1[1].y, 1, -p2[1].y * p1[1].x, -p2[1].y * p1[1].y],
    [p1[2].x, p1[2].y, 1, 0, 0, 0, -p2[2].x * p1[2].x, -p2[2].x * p1[2].y],
    [0, 0, 0, p1[2].x, p1[2].y, 1, -p2[2].y * p1[2].x, -p2[2].y * p1[2].y],
    [p1[3].x, p1[3].y, 1, 0, 0, 0, -p2[3].x * p1[3].x, -p2[3].x * p1[3].y],
    [0, 0, 0, p1[3].x, p1[3].y, 1, -p2[3].y * p1[3].x, -p2[3].y * p1[3].y]
  ];
  const b = [p2[0].x, p2[0].y, p2[1].x, p2[1].y, p2[2].x, p2[2].y, p2[3].x, p2[3].y];

  // Solve system of equations using Gaussian elimination
  const n = 8;
  for (let i = 0; i < n; i++) {
    let max = i;
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(a[j][i]) > Math.abs(a[max][i])) max = j;
    }
    [a[i], a[max]] = [a[max], a[i]];
    [b[i], b[max]] = [b[max], b[i]];

    for (let j = i + 1; j < n; j++) {
      const c = a[j][i] / a[i][i];
      for (let k = i; k < n; k++) a[j][k] -= c * a[i][k];
      b[j] -= c * b[i];
    }
  }

  const x = new Array(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = 0;
    for (let j = i + 1; j < n; j++) sum += a[i][j] * x[j];
    x[i] = (b[i] - sum) / a[i][i];
  }

  return [
    x[0], x[3], 0, x[6],
    x[1], x[4], 0, x[7],
    0, 0, 1, 0,
    x[2], x[5], 0, 1
  ];
}

export default function App() {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [nextZIndex, setNextZIndex] = useState(1);
  const [isLocked, setIsLocked] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files as FileList).forEach((file: File, index) => {
      if (file.type.startsWith('video/')) {
        const videoElement = document.createElement('video');
        videoElement.src = URL.createObjectURL(file);
        videoElement.onloadedmetadata = () => {
          const w = videoElement.videoWidth || 480;
          const h = videoElement.videoHeight || 270;
          const aspect = w / h;
          const initialWidth = 480;
          const initialHeight = initialWidth / aspect;
          
          const startX = 100 + (videos.length + index) * 50;
          const startY = 100 + (videos.length + index) * 50;

          const newVideo: VideoItem = {
            id: Math.random().toString(36).substr(2, 9),
            url: videoElement.src,
            corners: [
              { x: startX, y: startY }, // TL
              { x: startX + initialWidth, y: startY }, // TR
              { x: startX + initialWidth, y: startY + initialHeight }, // BR
              { x: startX, y: startY + initialHeight }, // BL
            ],
            zIndex: nextZIndex + index,
            isPaused: false,
            isMuted: true,
            originalWidth: w,
            originalHeight: h,
          };

          setVideos(prev => [...prev, newVideo]);
          setNextZIndex(prev => prev + 1);
        };
      }
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeVideo = (id: string) => {
    setVideos(videos.filter((v) => v.id !== id));
  };

  const resetVideo = (id: string) => {
    setVideos(videos.map(v => {
      if (v.id === id) {
        const aspect = v.originalWidth / v.originalHeight;
        const w = 480;
        const h = w / aspect;
        const centerX = v.corners[0].x;
        const centerY = v.corners[0].y;
        return {
          ...v,
          corners: [
            { x: centerX, y: centerY },
            { x: centerX + w, y: centerY },
            { x: centerX + w, y: centerY + h },
            { x: centerX, y: centerY + h },
          ]
        };
      }
      return v;
    }));
  };

  const bringToFront = (id: string) => {
    if (isLocked) return;
    setVideos(
      videos.map((v) =>
        v.id === id ? { ...v, zIndex: nextZIndex } : v
      )
    );
    setNextZIndex(nextZIndex + 1);
  };

  const updateVideo = (id: string, updates: Partial<VideoItem>) => {
    setVideos(videos.map((v) => (v.id === id ? { ...v, ...updates } : v)));
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden font-sans text-white select-none">
      {/* Background Grid */}
      <div className="absolute inset-0 opacity-5 pointer-events-none" 
           style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '50px 50px' }} />

      {/* Canvas Area */}
      <div className="relative w-full h-full">
        <AnimatePresence>
          {videos.map((video) => (
            <VideoPlayer
              key={video.id}
              video={video}
              isLocked={isLocked}
              onRemove={() => removeVideo(video.id)}
              onReset={() => resetVideo(video.id)}
              onUpdate={(updates) => updateVideo(video.id, updates)}
              onFocus={() => bringToFront(video.id)}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Controls Overlay */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-zinc-900/90 backdrop-blur-xl border border-zinc-800 p-4 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] z-[9999]">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-2xl font-bold hover:bg-zinc-200 transition-all active:scale-95 shadow-lg"
        >
          <Plus size={24} strokeWidth={3} />
          <span>Add Video</span>
        </button>
        
        <div className="h-8 w-[1px] bg-zinc-700 mx-2" />
        
        <button
          onClick={() => setIsLocked(!isLocked)}
          className={`p-3 rounded-2xl transition-all active:scale-90 ${isLocked ? 'bg-amber-500 text-black shadow-[0_0_20px_rgba(245,158,11,0.4)]' : 'bg-zinc-800 text-zinc-400 hover:text-white'}`}
          title={isLocked ? "Unlock Layout" : "Lock Layout"}
        >
          {isLocked ? <Lock size={24} /> : <Unlock size={24} />}
        </button>

        <button
          onClick={() => confirm('Clear all videos?') && setVideos([])}
          className="p-3 bg-zinc-800 text-zinc-400 hover:text-red-400 rounded-2xl transition-all active:scale-90"
          title="Clear All"
        >
          <Trash2 size={24} />
        </button>

        <div className="h-8 w-[1px] bg-zinc-700 mx-2" />
        
        <div className="flex flex-col items-center px-2">
          <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">Active</span>
          <span className="text-xl font-mono font-bold leading-none">{videos.length}</span>
        </div>
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept="video/*"
          multiple
          className="hidden"
        />
      </div>

      {/* Empty State */}
      {videos.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 pointer-events-none">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-32 h-32 bg-zinc-900/50 rounded-[40px] flex items-center justify-center mb-8 border border-zinc-800 backdrop-blur-sm"
          >
            <Upload size={56} className="text-zinc-700" />
          </motion.div>
          <h1 className="text-6xl font-black tracking-tighter mb-4 bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">
            PROJECTOR CANVAS
          </h1>
          <p className="text-zinc-500 max-w-md text-lg font-medium leading-relaxed">
            Drag corners to map videos to any surface.<br/>
            Perfect for keystone correction and creative mapping.
          </p>
        </div>
      )}
    </div>
  );
}

interface VideoPlayerProps {
  video: VideoItem;
  isLocked: boolean;
  onRemove: () => void;
  onReset: () => void;
  onUpdate: (updates: Partial<VideoItem>) => void;
  onFocus: () => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ video, isLocked, onRemove, onReset, onUpdate, onFocus }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [activeHandle, setActiveHandle] = useState<number | null>(null);

  // Calculate the transform to map the video's natural dimensions to the 4 corners
  const { matrix, minX, minY, width, height } = useMemo(() => {
    const xs = video.corners.map(p => p.x);
    const ys = video.corners.map(p => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    const w = maxX - minX;
    const h = maxY - minY;

    // Source points are the corners of the original video dimensions
    const srcPoints = [
      { x: 0, y: 0 },
      { x: video.originalWidth, y: 0 },
      { x: video.originalWidth, y: video.originalHeight },
      { x: 0, y: video.originalHeight }
    ];

    // Destination points are the actual corner positions
    // Note: We don't subtract minX/minY here because we'll position the warped div at 0,0
    const dstPoints = video.corners;

    const m = getPerspectiveTransform(srcPoints, dstPoints);
    return { matrix: `matrix3d(${m.join(',')})`, minX, minY, width: w, height: h };
  }, [video.corners, video.originalWidth, video.originalHeight]);

  useEffect(() => {
    if (videoRef.current) {
      if (video.isPaused) videoRef.current.pause();
      else videoRef.current.play().catch(() => {});
      videoRef.current.muted = video.isMuted;
    }
  }, [video.isPaused, video.isMuted]);

  const handleCornerDrag = (index: number, e: React.MouseEvent | React.TouchEvent) => {
    if (isLocked) return;
    e.stopPropagation();
    onFocus();
    setActiveHandle(index);

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      const clientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const clientY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;
      
      const newCorners = [...video.corners] as [Point, Point, Point, Point];
      newCorners[index] = { x: clientX, y: clientY };
      onUpdate({ corners: newCorners });
    };

    const onUp = () => {
      setActiveHandle(null);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };

  const handleBodyDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (isLocked) return;
    e.stopPropagation();
    onFocus();

    const startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const startY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const initialCorners = [...video.corners];

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      const currentX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;
      const currentY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;
      
      const dx = currentX - startX;
      const dy = currentY - startY;

      const newCorners = initialCorners.map(p => ({
        x: p.x + dx,
        y: p.y + dy
      })) as [Point, Point, Point, Point];
      
      onUpdate({ corners: newCorners });
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        zIndex: video.zIndex,
        pointerEvents: 'none' // Allow clicking through to other videos if not on this one
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* The Warped Video Container */}
      <div 
        style={{
          position: 'absolute',
          width: video.originalWidth,
          height: video.originalHeight,
          transform: matrix,
          transformOrigin: '0 0',
          overflow: 'hidden',
          pointerEvents: isLocked ? 'none' : 'auto',
          cursor: isLocked ? 'default' : 'move',
        }}
        onMouseDown={handleBodyDrag}
        onTouchStart={handleBodyDrag}
      >
        <video
          ref={videoRef}
          src={video.url}
          className="w-full h-full object-fill pointer-events-none"
          loop
          muted={video.isMuted}
          playsInline
        />

        {/* Video Controls Overlay */}
        <div className={`absolute inset-0 bg-black/40 flex flex-col justify-center items-center gap-10 transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex gap-8">
            <button
              onClick={(e) => { e.stopPropagation(); onUpdate({ isPaused: !video.isPaused }); }}
              className="p-10 bg-white/20 backdrop-blur-2xl rounded-full hover:bg-white/40 transition-all active:scale-90 shadow-2xl border border-white/10"
            >
              {video.isPaused ? <Play size={64} fill="currentColor" /> : <Pause size={64} fill="currentColor" />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onUpdate({ isMuted: !video.isMuted }); }}
              className="p-10 bg-white/20 backdrop-blur-2xl rounded-full hover:bg-white/40 transition-all active:scale-90 shadow-2xl border border-white/10"
            >
              {video.isMuted ? <VolumeX size={64} /> : <Volume2 size={64} />}
            </button>
          </div>
          
          <div className="flex gap-4">
            <button
              onClick={(e) => { e.stopPropagation(); onReset(); }}
              className="px-8 py-4 bg-zinc-800/90 hover:bg-zinc-700 rounded-2xl text-sm font-black flex items-center gap-3 transition-all active:scale-95 shadow-xl border border-zinc-700"
            >
              <RefreshCw size={20} strokeWidth={3} /> RESET SHAPE
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              className="px-8 py-4 bg-red-600/90 hover:bg-red-500 rounded-2xl text-sm font-black flex items-center gap-3 transition-all active:scale-95 shadow-xl border border-red-500"
            >
              <Trash2 size={20} strokeWidth={3} /> REMOVE
            </button>
          </div>
        </div>
      </div>

      {/* Corner Handles (Only visible when not locked) */}
      {!isLocked && video.corners.map((p, i) => (
        <div
          key={i}
          onMouseDown={(e) => handleCornerDrag(i, e)}
          onTouchStart={(e) => handleCornerDrag(i, e)}
          style={{
            position: 'fixed',
            left: p.x,
            top: p.y,
            width: 32,
            height: 32,
            transform: 'translate(-50%, -50%)',
            zIndex: video.zIndex + 10,
            cursor: 'crosshair',
            pointerEvents: 'auto'
          }}
          className={`group flex items-center justify-center transition-opacity ${isHovered || activeHandle === i ? 'opacity-100' : 'opacity-0'}`}
        >
          <div className={`w-5 h-5 rounded-full border-2 border-white shadow-lg transition-all ${activeHandle === i ? 'scale-150 bg-amber-500 border-amber-500' : 'bg-white group-hover:scale-125'}`} />
          <div className="absolute inset-0 bg-white/20 rounded-full scale-150 blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      ))}
    </div>
  );
};
