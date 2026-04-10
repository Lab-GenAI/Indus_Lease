import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  Building2,
  FileText,
  ScrollText,
  ArrowRight,
  FolderOpen,
  IndianRupee,
  BrainCircuit,
  TrendingUp,
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

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.12,
      delayChildren: 0.05,
    },
  },
};

const fadeSlideUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.5 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: [0.34, 1.56, 0.64, 1] },
  },
};

const reducedVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
};

export default function Dashboard() {
  const prefersReducedMotion = useReducedMotion();

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
  });

  const { data: costs, isLoading: costsLoading } = useQuery<CostSummary>({
    queryKey: ["/api/costs/summary"],
  });

  const animVariants = prefersReducedMotion ? reducedVariants : fadeSlideUp;
  const animScaleIn = prefersReducedMotion ? reducedVariants : scaleIn;

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: "Total Sites",
      value: stats?.totalSites ?? 0,
      icon: Building2,
      gradient: "from-blue-500/10 to-blue-600/5",
      iconBg: "bg-blue-500/15",
      iconColor: "text-blue-600",
      valueColor: "text-blue-700 dark:text-blue-400",
    },
    {
      title: "Total Leases",
      value: stats?.totalLeases ?? 0,
      icon: ScrollText,
      gradient: "from-emerald-500/10 to-emerald-600/5",
      iconBg: "bg-emerald-500/15",
      iconColor: "text-emerald-600",
      valueColor: "text-emerald-700 dark:text-emerald-400",
    },
    {
      title: "Total Files",
      value: stats?.totalFiles ?? 0,
      icon: FileText,
      gradient: "from-amber-500/10 to-amber-600/5",
      iconBg: "bg-amber-500/15",
      iconColor: "text-amber-600",
      valueColor: "text-amber-700 dark:text-amber-400",
    },
  ];

  const fileTypes = stats?.fileTypeDistribution ?? {};
  const fileTypeTotal = Object.values(fileTypes).reduce((a, b) => a + b, 0);
  const totalCostInr = costs?.extractionInr ?? 0;

  const fileTypeColors: Record<string, string> = {
    pdf: "bg-red-500",
    docx: "bg-blue-500",
    doc: "bg-blue-400",
    msg: "bg-purple-500",
    eml: "bg-indigo-500",
    txt: "bg-gray-400",
  };

  return (
    <motion.div
      className="p-6 space-y-6 max-w-6xl mx-auto"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <motion.div
        className="rounded-xl pwc-gradient p-6 text-white shadow-lg overflow-hidden relative"
        variants={animVariants}
        whileHover={prefersReducedMotion ? undefined : { scale: 1.005, transition: { duration: 0.2 } }}
      >
        {!prefersReducedMotion && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent"
            style={{ width: "33%" }}
            animate={{ x: ["-100%", "400%"] }}
            transition={{
              duration: 2,
              repeat: Infinity,
              repeatDelay: 4,
              ease: "easeInOut",
            }}
          />
        )}
        <div className="flex items-center justify-between relative z-10">
          <div>
            <motion.h1
              className="text-2xl font-bold tracking-tight"
              data-testid="text-dashboard-title"
              initial={{ opacity: 0, x: prefersReducedMotion ? 0 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3, duration: prefersReducedMotion ? 0.1 : 0.5 }}
            >
              Lease Extractor Dashboard
            </motion.h1>
            <motion.p
              className="text-white/70 mt-1 text-sm"
              initial={{ opacity: 0, x: prefersReducedMotion ? 0 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.45, duration: prefersReducedMotion ? 0.1 : 0.5 }}
            >
              AI-powered lease document management and extraction
            </motion.p>
          </div>
          <div />
        </div>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            variants={animVariants}
            whileHover={prefersReducedMotion ? undefined : { scale: 1.03, transition: { duration: 0.2 } }}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.98 }}
          >
            <Card className={`border-0 shadow-sm bg-gradient-to-br ${stat.gradient} cursor-default`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <motion.p
                      className="text-xs font-medium text-muted-foreground uppercase tracking-wider"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: prefersReducedMotion ? 0 : 0.4 + index * 0.1 }}
                    >
                      {stat.title}
                    </motion.p>
                    <motion.p
                      className={`text-3xl font-bold mt-2 ${stat.valueColor}`}
                      data-testid={`text-stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}
                      variants={animScaleIn}
                    >
                      {stat.value}
                    </motion.p>
                  </div>
                  <motion.div
                    className={`p-3 rounded-xl ${stat.iconBg}`}
                    animate={prefersReducedMotion ? undefined : { y: [0, -4, 0] }}
                    transition={prefersReducedMotion ? undefined : {
                      duration: 3,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: index * 0.5,
                    }}
                  >
                    <stat.icon className={`h-6 w-6 ${stat.iconColor}`} />
                  </motion.div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          variants={animVariants}
          whileHover={prefersReducedMotion ? undefined : { y: -2, transition: { duration: 0.2 } }}
        >
          <Card className="shadow-sm h-full" data-testid="card-cost-summary">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
                <motion.span
                  animate={prefersReducedMotion ? undefined : { rotate: [0, 5, -5, 0] }}
                  transition={prefersReducedMotion ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="inline-flex"
                >
                  <TrendingUp className="h-4 w-4 text-primary" />
                </motion.span>
                Cost Tracker
              </CardTitle>
            </CardHeader>
            <CardContent>
              {costsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-16 rounded-lg" />
                </div>
              ) : totalCostInr === 0 ? (
                <motion.div
                  className="flex flex-col items-center justify-center py-8 text-center"
                  initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5, duration: prefersReducedMotion ? 0.1 : 0.4 }}
                >
                  <motion.div
                    className="p-4 rounded-full bg-muted/50 mb-3"
                    animate={prefersReducedMotion ? undefined : {
                      scale: [1, 1.05, 1],
                      opacity: [0.4, 0.6, 0.4],
                    }}
                    transition={prefersReducedMotion ? undefined : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  >
                    <IndianRupee className="h-8 w-8 text-muted-foreground/40" />
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
                    className="flex items-center justify-between p-4 rounded-xl pwc-gradient-subtle border border-primary/10"
                    initial={{ opacity: 0, x: prefersReducedMotion ? 0 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4, duration: prefersReducedMotion ? 0.1 : 0.5 }}
                  >
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Extraction Cost</p>
                      <p className="text-3xl font-bold text-primary mt-1" data-testid="text-total-cost-inr">
                        {formatInr(totalCostInr)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        ${(costs?.extractionUsd ?? 0).toFixed(4)} USD
                      </p>
                    </div>
                    <motion.div
                      className="p-3 rounded-xl bg-primary/10"
                      animate={prefersReducedMotion ? undefined : { y: [0, -4, 0] }}
                      transition={prefersReducedMotion ? undefined : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <BrainCircuit className="h-6 w-6 text-primary" />
                    </motion.div>
                  </motion.div>

                  <div className="grid grid-cols-2 gap-3">
                    <motion.div
                      className="p-3 rounded-xl bg-violet-500/5 border border-violet-200/50 dark:border-violet-800/50"
                      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.55, duration: prefersReducedMotion ? 0.1 : 0.4 }}
                    >
                      <p className="text-xs text-muted-foreground font-medium mb-1">Input Tokens</p>
                      <p className="text-lg font-bold text-violet-600 dark:text-violet-400" data-testid="text-input-tokens">
                        {formatTokens(costs?.totalInputTokens ?? 0)}
                      </p>
                    </motion.div>
                    <motion.div
                      className="p-3 rounded-xl bg-blue-500/5 border border-blue-200/50 dark:border-blue-800/50"
                      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.65, duration: prefersReducedMotion ? 0.1 : 0.4 }}
                    >
                      <p className="text-xs text-muted-foreground font-medium mb-1">Output Tokens</p>
                      <p className="text-lg font-bold text-blue-600 dark:text-blue-400" data-testid="text-output-tokens">
                        {formatTokens(costs?.totalOutputTokens ?? 0)}
                      </p>
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          variants={animVariants}
          whileHover={prefersReducedMotion ? undefined : { y: -2, transition: { duration: 0.2 } }}
        >
          <Card className="shadow-sm h-full">
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
                <motion.span
                  animate={prefersReducedMotion ? undefined : { rotate: [0, -5, 5, 0] }}
                  transition={prefersReducedMotion ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                  className="inline-flex"
                >
                  <FileText className="h-4 w-4 text-primary" />
                </motion.span>
                File Types
              </CardTitle>
              <Link href="/sites">
                <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80 -mr-2" data-testid="button-browse-sites">
                  Browse <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {Object.keys(fileTypes).length === 0 ? (
                <motion.div
                  className="flex flex-col items-center justify-center py-8 text-center"
                  initial={{ opacity: 0, scale: prefersReducedMotion ? 1 : 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5, duration: prefersReducedMotion ? 0.1 : 0.4 }}
                >
                  <motion.div
                    className="p-4 rounded-full bg-muted/50 mb-3"
                    animate={prefersReducedMotion ? undefined : {
                      scale: [1, 1.05, 1],
                      opacity: [0.4, 0.6, 0.4],
                    }}
                    transition={prefersReducedMotion ? undefined : { duration: 3, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                  >
                    <FolderOpen className="h-8 w-8 text-muted-foreground/40" />
                  </motion.div>
                  <p className="text-sm text-muted-foreground mb-3">
                    No files uploaded yet
                  </p>
                  <Link href="/sites">
                    <motion.div
                      whileHover={prefersReducedMotion ? undefined : { scale: 1.05 }}
                      whileTap={prefersReducedMotion ? undefined : { scale: 0.95 }}
                    >
                      <Button size="sm" data-testid="button-upload-folder">
                        <FolderOpen className="h-3.5 w-3.5 mr-1.5" />
                        Upload Folder
                      </Button>
                    </motion.div>
                  </Link>
                </motion.div>
              ) : (
                <motion.div
                  className="space-y-3"
                  initial="hidden"
                  animate="visible"
                  variants={{
                    hidden: {},
                    visible: { transition: { staggerChildren: prefersReducedMotion ? 0 : 0.08, delayChildren: prefersReducedMotion ? 0 : 0.3 } },
                  }}
                >
                  {Object.entries(fileTypes).map(([type, count]) => {
                    const pct = fileTypeTotal > 0 ? Math.round((count / fileTypeTotal) * 100) : 0;
                    const barColor = fileTypeColors[type.toLowerCase()] || "bg-gray-400";
                    return (
                      <motion.div
                        key={type}
                        className="space-y-1.5"
                        variants={{
                          hidden: { opacity: 0, x: prefersReducedMotion ? 0 : -12 },
                          visible: { opacity: 1, x: 0, transition: { duration: prefersReducedMotion ? 0.1 : 0.4 } },
                        }}
                      >
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${barColor}`} />
                            <span className="font-medium uppercase text-xs tracking-wider">.{type}</span>
                          </div>
                          <span className="text-xs text-muted-foreground font-medium">
                            {count} file{count !== 1 ? "s" : ""} ({pct}%)
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${barColor}`}
                            initial={{ width: prefersReducedMotion ? `${pct}%` : 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.8, delay: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
