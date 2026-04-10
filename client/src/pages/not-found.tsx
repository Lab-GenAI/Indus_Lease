import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { AlertCircle, Home, Sparkles } from "lucide-react";
import { MeshGradientBg, GlowOrb } from "@/components/motion-primitives";

export default function NotFound() {
  return (
    <div className="relative min-h-screen w-full flex items-center justify-center">
      <MeshGradientBg orbs={[
        { color: "rgba(239,68,68,0.1)", size: 350, top: "20%", left: "20%", delay: 0 },
        { color: "rgba(208,74,2,0.08)", size: 300, top: "60%", left: "60%", delay: 2 },
      ]} />

      <motion.div
        className="relative z-10 w-full max-w-md mx-4"
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <Card className="border border-white/10 dark:border-white/5 shadow-2xl backdrop-blur-sm overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-red-500/5 to-transparent rounded-bl-full" />

          <CardContent className="pt-10 pb-8 px-8 text-center relative z-10">
            <motion.div
              className="mx-auto mb-6 p-5 rounded-2xl bg-gradient-to-br from-red-500/15 to-red-500/5 w-fit"
              animate={{ scale: [1, 1.05, 1], rotate: [0, 5, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <AlertCircle className="h-12 w-12 text-red-500" />
            </motion.div>

            <motion.h1
              className="text-5xl font-black text-foreground mb-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              style={{ textShadow: "0 0 40px rgba(239,68,68,0.15)" }}
            >
              404
            </motion.h1>

            <motion.p
              className="text-lg font-semibold text-foreground mb-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              Page Not Found
            </motion.p>

            <motion.p
              className="text-sm text-muted-foreground mb-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              The page you're looking for doesn't exist or has been moved.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Link href="/">
                <motion.div whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.95 }}>
                  <Button size="lg" className="shadow-lg">
                    <Home className="h-4 w-4 mr-2" />
                    Back to Dashboard
                  </Button>
                </motion.div>
              </Link>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
