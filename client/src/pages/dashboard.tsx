import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { motion, useMotionValue, useTransform, useSpring } from "framer-motion";
import { useRef, useState, useEffect, useCallback } from "react";
import {
  Building2,
  FileText,
  ScrollText,
  ArrowRight,
  FolderOpen,
  IndianRupee,
  BrainCircuit,
  TrendingUp,
  Sparkles,
  Zap,
  Activity,
  BarChart3,
} from "lucide-react";

interface DashboardStats {
  totalSites: number;
  totalLeases: number;
  totalFiles: number;
  fileTypeDistribution: Record<string, number>;
}

interface CostSummary {
  totalInr: number;
  totalUsd: number;
  extractionInr: number;
  extractionUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
}

function formatInr(value: number): string {
  if (value < 0.01) return "₹0.00";
  return "₹" + value.toFixed(2);
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
  if (value >= 1_000) return (value / 1_000).toFixed(1) + "K";
  return value.toString();
}

function AnimatedCounter({ value, duration = 1.5 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let start = 0;
    const end = value;
    if (end === 0) { setDisplay(0); return; }
    const startTime = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - startTime) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.floor(eased * end));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value, duration]);
  return <>{display}</>;
}

function FloatingParticles() {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 3 + 1,
    duration: Math.random() * 8 + 6,
    delay: Math.random() * 4,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-white/10"
          style={{ width: p.size, height: p.size, left: `${p.x}%`, top: `${p.y}%` }}
          animate={{
            y: [0, -30, 0],
            x: [0, Math.random() * 20 - 10, 0],
            opacity: [0, 0.6, 0],
            scale: [0.5, 1, 0.5],
          }}
          transition={{
            duration: p.duration,
            repeat: Infinity,
            delay: p.delay,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function GlowOrb({ color, size, top, left, delay }: {
  color: string; size: number; top: string; left: string; delay: number;
}) {
  return (
    <motion.div
      className="absolute rounded-full blur-3xl pointer-events-none"
      style={{
        width: size,
        height: size,
        top,
        left,
        background: color,
      }}
      animate={{
        scale: [1, 1.3, 1],
        opacity: [0.15, 0.3, 0.15],
      }}
      transition={{
        duration: 6,
        repeat: Infinity,
        delay,
        ease: "easeInOut",
      }}
    />
  );
}

function Tilt3DCard({ children, className = "", glowColor = "rgba(208,74,2,0.15)" }: {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [8, -8]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-8, 8]), { stiffness: 300, damping: 30 });

  const handleMouse = useCallback((e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  }, [x, y]);

  const handleLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
        perspective: 1000,
      }}
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

function PulseRing({ delay = 0, color = "rgba(208,74,2,0.3)" }: { delay?: number; color?: string }) {
  return (
    <motion.div
      className="absolute inset-0 rounded-2xl pointer-events-none"
      style={{ border: `1px solid ${color}` }}
      animate={{ scale: [1, 1.05, 1], opacity: [0.5, 0, 0.5] }}
      transition={{ duration: 3, repeat: Infinity, delay, ease: "easeInOut" }}
    />
  );
}

function MeshGradientBg() {
  return (
    <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
      <GlowOrb color="rgba(208,74,2,0.12)" size={400} top="-5%" left="-5%" delay={0} />
      <GlowOrb color="rgba(59,130,246,0.08)" size={350} top="60%" left="70%" delay={2} />
      <GlowOrb color="rgba(168,85,247,0.06)" size={300} top="30%" left="50%" delay={4} />
      <GlowOrb color="rgba(16,185,129,0.06)" size={250} top="80%" left="10%" delay={1} />
    </div>
  );
}

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: costs, isLoading: costsLoading } = useQuery<CostSummary>({
    queryKey: ["/api/costs/summary"],
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-40 rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Sites",
      value: stats?.totalSites ?? 0,
      icon: Building2,
      accentIcon: Sparkles,
      gradient: "from-blue-500/20 via-blue-400/10 to-cyan-500/5",
      borderGlow: "hover:shadow-blue-500/20",
      iconBg: "bg-gradient-to-br from-blue-500 to-blue-600",
      valueColor: "text-blue-500",
      barColor: "from-blue-500 to-cyan-400",
      glowColor: "rgba(59,130,246,0.2)",
    },
    {
      title: "Total Leases",
      value: stats?.totalLeases ?? 0,
      icon: ScrollText,
      accentIcon: Zap,
      gradient: "from-emerald-500/20 via-emerald-400/10 to-teal-500/5",
      borderGlow: "hover:shadow-emerald-500/20",
      iconBg: "bg-gradient-to-br from-emerald-500 to-teal-600",
      valueColor: "text-emerald-500",
      barColor: "from-emerald-500 to-teal-400",
      glowColor: "rgba(16,185,129,0.2)",
    },
    {
      title: "Total Files",
      value: stats?.totalFiles ?? 0,
      icon: FileText,
      accentIcon: Activity,
      gradient: "from-amber-500/20 via-orange-400/10 to-yellow-500/5",
      borderGlow: "hover:shadow-amber-500/20",
      iconBg: "bg-gradient-to-br from-amber-500 to-orange-600",
      valueColor: "text-amber-500",
      barColor: "from-amber-500 to-yellow-400",
      glowColor: "rgba(245,158,11,0.2)",
    },
  ];

  const fileTypes = stats?.fileTypeDistribution ?? {};
  const fileTypeTotal = Object.values(fileTypes).reduce((a, b) => a + b, 0);
  const totalCostInr = costs?.extractionInr ?? 0;

  const fileTypeColors: Record<string, { bar: string; dot: string; glow: string }> = {
    pdf: { bar: "from-red-500 to-rose-400", dot: "bg-red-500", glow: "shadow-red-500/30" },
    docx: { bar: "from-blue-500 to-indigo-400", dot: "bg-blue-500", glow: "shadow-blue-500/30" },
    doc: { bar: "from-blue-400 to-sky-400", dot: "bg-blue-400", glow: "shadow-blue-400/30" },
    msg: { bar: "from-purple-500 to-violet-400", dot: "bg-purple-500", glow: "shadow-purple-500/30" },
    eml: { bar: "from-indigo-500 to-blue-400", dot: "bg-indigo-500", glow: "shadow-indigo-500/30" },
    txt: { bar: "from-gray-500 to-gray-400", dot: "bg-gray-400", glow: "shadow-gray-400/30" },
  };

  return (
    <div className="relative min-h-screen">
      <MeshGradientBg />

      <motion.div
        className="p-6 space-y-6 max-w-7xl mx-auto relative z-10"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
        }}
      >
        <motion.div
          className="relative rounded-2xl overflow-hidden"
          variants={{ hidden: { opacity: 0, y: 30, scale: 0.98 }, visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] } } }}
          style={{ transformStyle: "preserve-3d", perspective: 1200 }}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-[#D04A02] via-[#b33d00] to-[#8B2500]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(0,0,0,0.2),transparent_60%)]" />
          <FloatingParticles />

          <motion.div
            className="absolute top-0 left-0 w-full h-full"
            style={{
              background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.08) 45%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.08) 55%, transparent 60%)",
            }}
            animate={{ x: ["-100%", "200%"] }}
            transition={{ duration: 4, repeat: Infinity, repeatDelay: 6, ease: "easeInOut" }}
          />

          <div className="relative z-10 p-8 flex items-center justify-between">
            <div className="space-y-3">
              <motion.div
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3, duration: 0.6 }}
              >
                <motion.div
                  className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20"
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                >
                  <BrainCircuit className="h-6 w-6 text-white" />
                </motion.div>
                <div>
                  <h1
                    className="text-3xl font-bold tracking-tight text-white"
                    data-testid="text-dashboard-title"
                  >
                    Lease Extractor Dashboard
                  </h1>
                  <p className="text-white/60 text-sm mt-0.5">
                    AI-powered lease document management and extraction
                  </p>
                </div>
              </motion.div>
            </div>

            <motion.div
              className="hidden md:flex items-center gap-2"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
            >
              <Link href="/sites">
                <motion.div whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }}>
                  <Button
                    className="bg-white/15 backdrop-blur-sm border border-white/25 text-white hover:bg-white/25 shadow-lg shadow-black/10"
                    data-testid="button-get-started"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Get Started
                  </Button>
                </motion.div>
              </Link>
            </motion.div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {statCards.map((stat, index) => (
            <motion.div
              key={stat.title}
              variants={{
                hidden: { opacity: 0, y: 30, rotateX: -15 },
                visible: {
                  opacity: 1, y: 0, rotateX: 0,
                  transition: { duration: 0.6, delay: index * 0.1, ease: [0.25, 0.46, 0.45, 0.94] },
                },
              }}
            >
              <Tilt3DCard glowColor={stat.glowColor}>
                <Card className={`border border-white/10 dark:border-white/5 shadow-lg ${stat.borderGlow} hover:shadow-xl bg-gradient-to-br ${stat.gradient} backdrop-blur-sm overflow-hidden transition-shadow duration-500 relative`}>
                  <PulseRing delay={index * 1} color={stat.glowColor} />

                  <CardContent className="p-6 relative z-10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-3 flex-1">
                        <motion.p
                          className="text-xs font-semibold text-muted-foreground uppercase tracking-widest"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.5 + index * 0.1 }}
                        >
                          {stat.title}
                        </motion.p>
                        <p
                          className={`text-4xl font-black ${stat.valueColor} tabular-nums`}
                          data-testid={`text-stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}
                          style={{ textShadow: `0 0 30px ${stat.glowColor}` }}
                        >
                          <AnimatedCounter value={stat.value} duration={1.2 + index * 0.3} />
                        </p>

                        <div className="h-1.5 rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full bg-gradient-to-r ${stat.barColor}`}
                            initial={{ width: 0 }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 1.5, delay: 0.5 + index * 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                          />
                        </div>
                      </div>

                      <motion.div
                        className={`p-3.5 rounded-2xl ${stat.iconBg} shadow-lg relative`}
                        animate={{ y: [0, -6, 0], rotate: [0, 3, -3, 0] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: index * 0.7 }}
                        style={{ transformStyle: "preserve-3d" }}
                      >
                        <stat.icon className="h-6 w-6 text-white" />
                        <motion.div
                          className="absolute -top-1 -right-1"
                          animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.5, 1, 0.5] }}
                          transition={{ duration: 2, repeat: Infinity, delay: index * 0.5 }}
                        >
                          <stat.accentIcon className="h-3 w-3 text-white/80" />
                        </motion.div>
                      </motion.div>
                    </div>
                  </CardContent>
                </Card>
              </Tilt3DCard>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div
            variants={{
              hidden: { opacity: 0, x: -40, rotateY: 10 },
              visible: { opacity: 1, x: 0, rotateY: 0, transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] } },
            }}
          >
            <Tilt3DCard glowColor="rgba(208,74,2,0.15)">
              <Card className="shadow-lg hover:shadow-xl transition-shadow duration-500 h-full border border-white/10 dark:border-white/5 backdrop-blur-sm overflow-hidden relative" data-testid="card-cost-summary">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-primary/5 to-transparent rounded-bl-full" />

                <CardHeader className="pb-3 relative z-10">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2.5 uppercase tracking-widest text-muted-foreground">
                    <motion.div
                      className="p-1.5 rounded-lg bg-primary/10"
                      animate={{ rotate: [0, 360] }}
                      transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    >
                      <TrendingUp className="h-4 w-4 text-primary" />
                    </motion.div>
                    Cost Tracker
                    <motion.div
                      className="ml-auto px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold"
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      LIVE
                    </motion.div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="relative z-10">
                  {costsLoading ? (
                    <div className="space-y-3">
                      <Skeleton className="h-24 rounded-xl" />
                      <Skeleton className="h-16 rounded-xl" />
                    </div>
                  ) : totalCostInr === 0 ? (
                    <motion.div
                      className="flex flex-col items-center justify-center py-10 text-center"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5, duration: 0.4 }}
                    >
                      <motion.div
                        className="relative p-5 rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 mb-4"
                        animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <IndianRupee className="h-10 w-10 text-muted-foreground/40" />
                        <motion.div
                          className="absolute -top-1 -right-1 p-1 rounded-full bg-primary/20"
                          animate={{ scale: [0.8, 1.3, 0.8] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          <Sparkles className="h-3 w-3 text-primary" />
                        </motion.div>
                      </motion.div>
                      <p className="text-sm text-muted-foreground">
                        No costs recorded yet. Run extractions to start tracking.
                      </p>
                    </motion.div>
                  ) : (
                    <motion.div
                      className="space-y-4"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.3 }}
                    >
                      <motion.div
                        className="relative p-5 rounded-2xl overflow-hidden"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4, duration: 0.5 }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-[#D04A02]/10 via-[#D04A02]/5 to-transparent" />
                        <div className="absolute inset-0 border border-primary/15 rounded-2xl" />
                        <div className="relative flex items-center justify-between">
                          <div>
                            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-widest">Total Extraction Cost</p>
                            <p
                              className="text-4xl font-black text-primary mt-2 tabular-nums"
                              data-testid="text-total-cost-inr"
                              style={{ textShadow: "0 0 30px rgba(208,74,2,0.3)" }}
                            >
                              {formatInr(totalCostInr)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1.5 font-medium">
                              ${(costs?.extractionUsd ?? 0).toFixed(4)} USD
                            </p>
                          </div>
                          <motion.div
                            className="p-4 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/10"
                            animate={{ y: [0, -6, 0], rotate: [0, 5, -5, 0] }}
                            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                          >
                            <BrainCircuit className="h-7 w-7 text-primary" />
                          </motion.div>
                        </div>
                      </motion.div>

                      <div className="grid grid-cols-2 gap-3">
                        <motion.div
                          className="relative p-4 rounded-2xl overflow-hidden group/token"
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.55, duration: 0.4 }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-violet-500/5" />
                          <div className="absolute inset-0 border border-violet-500/15 rounded-2xl" />
                          <div className="relative">
                            <p className="text-xs text-muted-foreground font-semibold mb-1.5 tracking-wider">Input Tokens</p>
                            <p className="text-2xl font-black text-violet-500 tabular-nums" data-testid="text-input-tokens">
                              <AnimatedCounter value={costs?.totalInputTokens ?? 0} duration={2} />
                            </p>
                          </div>
                        </motion.div>
                        <motion.div
                          className="relative p-4 rounded-2xl overflow-hidden group/token"
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.65, duration: 0.4 }}
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-blue-500/5" />
                          <div className="absolute inset-0 border border-blue-500/15 rounded-2xl" />
                          <div className="relative">
                            <p className="text-xs text-muted-foreground font-semibold mb-1.5 tracking-wider">Output Tokens</p>
                            <p className="text-2xl font-black text-blue-500 tabular-nums" data-testid="text-output-tokens">
                              <AnimatedCounter value={costs?.totalOutputTokens ?? 0} duration={2.2} />
                            </p>
                          </div>
                        </motion.div>
                      </div>
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </Tilt3DCard>
          </motion.div>

          <motion.div
            variants={{
              hidden: { opacity: 0, x: 40, rotateY: -10 },
              visible: { opacity: 1, x: 0, rotateY: 0, transition: { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] } },
            }}
          >
            <Tilt3DCard glowColor="rgba(168,85,247,0.12)">
              <Card className="shadow-lg hover:shadow-xl transition-shadow duration-500 h-full border border-white/10 dark:border-white/5 backdrop-blur-sm overflow-hidden relative">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-purple-500/5 to-transparent rounded-bl-full" />

                <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3 relative z-10">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2.5 uppercase tracking-widest text-muted-foreground">
                    <motion.div
                      className="p-1.5 rounded-lg bg-purple-500/10"
                      animate={{ rotate: [0, -360] }}
                      transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    >
                      <BarChart3 className="h-4 w-4 text-purple-500" />
                    </motion.div>
                    File Types
                  </CardTitle>
                  <Link href="/sites">
                    <motion.div whileHover={{ scale: 1.05, x: 3 }} whileTap={{ scale: 0.95 }}>
                      <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 -mr-2" data-testid="button-browse-sites">
                        Browse <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </motion.div>
                  </Link>
                </CardHeader>
                <CardContent className="relative z-10">
                  {Object.keys(fileTypes).length === 0 ? (
                    <motion.div
                      className="flex flex-col items-center justify-center py-10 text-center"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.5, duration: 0.4 }}
                    >
                      <motion.div
                        className="relative p-5 rounded-2xl bg-gradient-to-br from-muted/50 to-muted/30 mb-4"
                        animate={{ scale: [1, 1.05, 1], rotate: [0, -5, 5, 0] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                      >
                        <FolderOpen className="h-10 w-10 text-muted-foreground/40" />
                      </motion.div>
                      <p className="text-sm text-muted-foreground mb-4">
                        No files uploaded yet
                      </p>
                      <Link href="/sites">
                        <motion.div whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }}>
                          <Button size="sm" className="shadow-lg" data-testid="button-upload-folder">
                            <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                            Upload Folder
                          </Button>
                        </motion.div>
                      </Link>
                    </motion.div>
                  ) : (
                    <motion.div
                      className="space-y-4"
                      initial="hidden"
                      animate="visible"
                      variants={{
                        hidden: {},
                        visible: { transition: { staggerChildren: 0.08, delayChildren: 0.3 } },
                      }}
                    >
                      {Object.entries(fileTypes).map(([type, count]) => {
                        const pct = fileTypeTotal > 0 ? Math.round((count / fileTypeTotal) * 100) : 0;
                        const colors = fileTypeColors[type.toLowerCase()] || { bar: "from-gray-500 to-gray-400", dot: "bg-gray-400", glow: "" };
                        return (
                          <motion.div
                            key={type}
                            className="space-y-2"
                            variants={{
                              hidden: { opacity: 0, x: -20, scale: 0.95 },
                              visible: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.5 } },
                            }}
                          >
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-center gap-2.5">
                                <motion.div
                                  className={`h-2.5 w-2.5 rounded-full ${colors.dot} shadow-lg ${colors.glow}`}
                                  animate={{ scale: [1, 1.3, 1] }}
                                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                                />
                                <span className="font-bold uppercase text-xs tracking-widest">.{type}</span>
                              </div>
                              <motion.span
                                className="text-xs text-muted-foreground font-semibold tabular-nums"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.6 }}
                              >
                                {count} file{count !== 1 ? "s" : ""} ({pct}%)
                              </motion.span>
                            </div>
                            <div className="h-2 rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
                              <motion.div
                                className={`h-full rounded-full bg-gradient-to-r ${colors.bar} shadow-sm`}
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 1, delay: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                              />
                            </div>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  )}
                </CardContent>
              </Card>
            </Tilt3DCard>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
