import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
import { useRef, useCallback } from "react";

export const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

export const fadeSlideUp = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export const fadeSlideRight = {
  hidden: { opacity: 0, x: -24 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.92 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

export function GlowOrb({ color, size, top, left, delay = 0 }: {
  color: string; size: number; top: string; left: string; delay?: number;
}) {
  return (
    <motion.div
      className="absolute rounded-full blur-3xl pointer-events-none"
      style={{ width: size, height: size, top, left, background: color }}
      animate={{ scale: [1, 1.3, 1], opacity: [0.12, 0.25, 0.12] }}
      transition={{ duration: 6, repeat: Infinity, delay, ease: "easeInOut" }}
    />
  );
}

export function MeshGradientBg({ orbs }: {
  orbs?: { color: string; size: number; top: string; left: string; delay?: number }[];
}) {
  const defaultOrbs = [
    { color: "rgba(208,74,2,0.1)", size: 350, top: "-5%", left: "-5%", delay: 0 },
    { color: "rgba(59,130,246,0.07)", size: 300, top: "60%", left: "70%", delay: 2 },
    { color: "rgba(168,85,247,0.05)", size: 280, top: "30%", left: "50%", delay: 4 },
    { color: "rgba(16,185,129,0.05)", size: 220, top: "80%", left: "10%", delay: 1 },
  ];
  const items = orbs || defaultOrbs;
  return (
    <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
      {items.map((o, i) => (
        <GlowOrb key={i} {...o} />
      ))}
    </div>
  );
}

export function PageWrapper({ children, className = "" }: {
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className="relative min-h-screen">
      <MeshGradientBg />
      <motion.div
        className={`relative z-10 ${className}`}
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {children}
      </motion.div>
    </div>
  );
}

export function AnimatedCard({ children, className = "", delay = 0 }: {
  children: React.ReactNode; className?: string; delay?: number;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20, scale: 0.97 },
        visible: {
          opacity: 1, y: 0, scale: 1,
          transition: { duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] },
        },
      }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Tilt3DCard({ children, className = "", glowColor = "rgba(208,74,2,0.12)" }: {
  children: React.ReactNode; className?: string; glowColor?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [6, -6]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-6, 6]), { stiffness: 300, damping: 30 });

  const handleMouse = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  }, [x, y]);

  const handleLeave = useCallback(() => { x.set(0); y.set(0); }, [x, y]);

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d", perspective: 1000 }}
      className={`relative group ${className}`}
    >
      <div
        className="absolute -inset-1 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"
        style={{ background: glowColor }}
      />
      {children}
    </motion.div>
  );
}

export function PageHeader({ icon, iconBg = "bg-primary/10", iconColor = "text-primary", title, subtitle, children, accentGradient = "from-[#D04A02] via-[#b33d00] to-[#8B2500]" }: {
  icon: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
  accentGradient?: string;
}) {
  return (
    <motion.div
      className="relative rounded-2xl overflow-hidden"
      variants={{ hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0, transition: { duration: 0.6 } } }}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${accentGradient}`} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.12),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(0,0,0,0.15),transparent_60%)]" />

      <motion.div
        className="absolute top-0 left-0 w-full h-full"
        style={{
          background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.06) 45%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.06) 55%, transparent 60%)",
        }}
        animate={{ x: ["-100%", "200%"] }}
        transition={{ duration: 4, repeat: Infinity, repeatDelay: 8, ease: "easeInOut" }}
      />

      <div className="relative z-10 p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <motion.div
            className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20"
            animate={{ rotate: [0, 3, -3, 0] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          >
            {icon}
          </motion.div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
            <p className="text-white/60 text-sm mt-0.5">{subtitle}</p>
          </div>
        </div>
        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
    </motion.div>
  );
}

export function FloatingIcon({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      animate={{ y: [0, -5, 0], rotate: [0, 3, -3, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay }}
      className="inline-flex"
    >
      {children}
    </motion.div>
  );
}

export function PulseRing({ delay = 0, color = "rgba(208,74,2,0.2)" }: { delay?: number; color?: string }) {
  return (
    <motion.div
      className="absolute inset-0 rounded-2xl pointer-events-none"
      style={{ border: `1px solid ${color}` }}
      animate={{ scale: [1, 1.04, 1], opacity: [0.4, 0, 0.4] }}
      transition={{ duration: 3, repeat: Infinity, delay, ease: "easeInOut" }}
    />
  );
}
