"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight, UserCheck, BriefcaseBusiness, GraduationCap, Building2,
  ShieldCheck, CheckCircle2, LogIn, FileText, Search,
  HeartHandshake, Network, ClipboardCheck, LockKeyhole, UsersRound
} from "lucide-react";
import styles from "./landing-redesign.module.css";

const journeys = [
  { title: "Join as a professional", text: "Apply for membership, build your profile and discover ways to contribute.", href: "/apply", action: "Start application", icon: UserCheck },
  { title: "Find a job", text: "Explore vacancies or begin with a short inquiry before the detailed application.", href: "/jobs", action: "Browse opportunities", icon: BriefcaseBusiness },
  { title: "Find mentorship", text: "Share your goals and begin a mentorship request, even before completing a profile.", href: "/mentorship", action: "Request mentorship", icon: GraduationCap },
  { title: "Register an organization", text: "Submit your organization for review, recruit talent and build professional partnerships.", href: "/organizations", action: "Get started", icon: Building2 }
];

const capabilities = [
  { title: "Trusted professional identity", text: "Build one professional record for membership, capability, experience and contribution.", icon: ShieldCheck },
  { title: "Verification with privacy", text: "Submit claims for review while private evidence stays behind authorized access controls.", icon: CheckCircle2 },
  { title: "Jobs and recruitment", text: "Explore vacancies and support a structured candidate journey from application to decision.", icon: BriefcaseBusiness },
  { title: "Services and mentorship", text: "Connect through professional services, mentorship requests and governed follow-up.", icon: HeartHandshake }
];

function MpaMark() {
  return (
    <svg viewBox="0 0 100 120" fill="none" className={styles.logoMark} aria-hidden="true">
      <motion.path d="M15 110V60C15 35 50 15 50 15V45C32 52 30 70 30 110Z" fill="#0A3258" stroke="#0A3258" strokeWidth="2"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeInOut" }} />
      <motion.path d="M85 35C85 35 50 15 50 15V45C68 52 78 57 78 70C78 78 73 85 65 85H32V70H65C78 70 78 57 68 52C50 45 50 15 50 15"
        fill="#97C024" stroke="#97C024" strokeWidth="2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, delay: 0.2, ease: "easeInOut" }} />
    </svg>
  );
}

function ArchBackdrop() {
  return (
    <div className={styles.archBackdrop} aria-hidden="true">
      <svg viewBox="0 0 1400 1200" fill="none" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="mpaArchLineGradient" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#0A3258" stopOpacity=".08" />
            <stop offset="55%" stopColor="#1B4D80" stopOpacity=".35" />
            <stop offset="100%" stopColor="#97C024" stopOpacity=".7" />
          </linearGradient>
          <pattern id="mpaGridDots" width="30" height="30" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" fill="#0A3258" opacity=".2" />
          </pattern>
        </defs>
        <rect width="1400" height="1200" fill="url(#mpaGridDots)" />
        <path d="M200 1200V500C200 250 500 100 700 100C900 100 1200 250 1200 500V1200"
          stroke="url(#mpaArchLineGradient)" strokeWidth="2.5" strokeDasharray="6 8" />
        <path d="M400 1200V600C400 380 550 220 700 220C850 220 1000 380 1000 600V1200"
          stroke="#0A3258" strokeWidth="1.5" opacity=".18" />
      </svg>
    </div>
  );
}

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div className={className} initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.16 }}
      transition={{ duration: 0.55, delay, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}

export default function Home() {
  const reduceMotion = useReducedMotion();
  return (
    <div className={styles.page}>
      <ArchBackdrop />
      <div className={styles.ambientGlow} aria-hidden="true" />

      <section className={styles.hero} aria-labelledby="landing-title">
        <motion.div className={styles.logoIntro} initial={reduceMotion ? false : { scale: 0.82, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.75, ease: "easeOut" }}>
          <MpaMark />
        </motion.div>
        <motion.div className={styles.networkTag} initial={reduceMotion ? false : { y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, delay: 0.12 }}>
          <span className={styles.liveDot} />
          MPA Professionals Network
        </motion.div>
        <motion.h1 id="landing-title" className={styles.heroTitle}
          initial={reduceMotion ? false : { y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.18 }}>
          Connecting trusted talent with{" "}
          <span>meaningful opportunity.</span>
        </motion.h1>
        <motion.p className={styles.heroSubtitle} initial={reduceMotion ? false : { y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6, delay: 0.27 }}>
          Helping professionals and organizations turn connections into meaningful work.
        </motion.p>
        <motion.div className={styles.heroActions} initial={reduceMotion ? false : { y: 18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6, delay: 0.36 }}>
          <Link href="/apply" className={styles.primaryCta}>Apply / Join MPA <ArrowRight size={17} /></Link>
          <Link href="/jobs" className={styles.secondaryCta}>Explore opportunities</Link>
          <Link href="/login" className={styles.loginCta}><LogIn size={16} /> Login</Link>
        </motion.div>
        <motion.div className={styles.trustSignals} initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.48 }}>
          <span><ShieldCheck size={16} /> Evidence-led review</span>
          <span><Network size={16} /> Professional connections</span>
          <span><LockKeyhole size={16} /> Privacy-aware access</span>
        </motion.div>
      </section>

      <section className={styles.section} aria-labelledby="journeys-title">
        <Reveal className={styles.sectionHeading}>
          <p className={styles.eyebrow}>A clear place to start</p>
          <h2 id="journeys-title">How can we help you today?</h2>
          <span className={styles.headingRule} />
        </Reveal>
        <div className={styles.journeyGrid}>
          {journeys.map(({ title, text, href, action, icon: Icon }, index) => (
            <Reveal key={title} delay={index * 0.06} className={styles.cardReveal}>
              <article className={styles.journeyCard}>
                <div>
                  <span className={styles.cardIcon}><Icon size={23} /></span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
                <Link href={href} className={styles.cardLink}>{action} <ArrowRight size={16} /></Link>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="capabilities-title">
        <div className={styles.capabilityPanel}>
          <Reveal className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Real value, not just a directory</p>
            <h2 id="capabilities-title">What the platform helps you do</h2>
            <span className={styles.headingRule} />
          </Reveal>
          <div className={styles.capabilityGrid}>
            {capabilities.map(({ title, text, icon: Icon }, index) => (
              <Reveal key={title} delay={index * 0.06} className={styles.capabilityItem}>
                <span className={styles.capabilityIcon}><Icon size={21} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.audienceGrid}>
          <Reveal>
            <article className={styles.audienceCard}>
              <span className={styles.audienceLabel}><UsersRound size={15} /> For members</span>
              <h2>From membership to professional value</h2>
              <p>Maintain your identity and membership, present verified capability without exposing private evidence, find relevant work, request mentorship, offer services and build a record of contribution.</p>
              <div className={styles.flowSteps}><span>Join</span><i>→</i><span>Build</span><i>→</i><span>Verify</span><i>→</i><span>Participate</span></div>
              <Link href="/apply" className={styles.inlineCta}>Start member application <ArrowRight size={16} /></Link>
            </article>
          </Reveal>
          <Reveal delay={0.08}>
            <article className={styles.audienceCard}>
              <span className={styles.audienceLabel}><Building2 size={15} /> For organizations</span>
              <h2>From registration to meaningful outcomes</h2>
              <p>Submit organization details for review, recruit eligible professionals, publish opportunities, request expertise and follow progress through the platform’s governed workflows.</p>
              <div className={styles.flowSteps}><span>Register</span><i>→</i><span>Verify</span><i>→</i><span>Engage</span><i>→</i><span>Deliver</span></div>
              <Link href="/organizations" className={styles.inlineCta}>Register organization <ArrowRight size={16} /></Link>
            </article>
          </Reveal>
        </div>
      </section>

      <section className={styles.section}>
        <Reveal className={styles.trackingPanel}>
          <div className={styles.trackingCopy}>
            <p className={styles.eyebrow}>No black box</p>
            <h2>Always know what happens next.</h2>
            <p>Track membership, organization and job applications with their current status, last update and next action. Private review notes and evidence remain available only to authorized users.</p>
            <Link href="/track" className={styles.inlineCta}>Track progress of your application <ArrowRight size={16} /></Link>
          </div>
          <div className={styles.trackingPreview} aria-label="Illustration of an application timeline">
            <div><span className={styles.timelineNode} /><span><b>Submitted</b><small>Application received</small></span><CheckCircle2 size={18} /></div>
            <div><span className={styles.timelineNode} /><span><b>Under review</b><small>Reviewer is checking your submission</small></span><ClipboardCheck size={18} /></div>
            <div><span className={styles.timelineNode} /><span><b>Next action</b><small>Correction or payment may be required</small></span><FileText size={18} /></div>
          </div>
        </Reveal>
      </section>

      <section className={styles.section + " " + styles.lastSection}>
        <Reveal className={styles.finalCta}>
          <div className={styles.finalArch} aria-hidden="true"><svg viewBox="0 0 800 600" fill="none"><path d="M400 600V100C400 50 500 10 600 10C700 10 800 50 800 100V600" stroke="#97C024" strokeWidth="4" /></svg></div>
          <div className={styles.finalContent}>
            <p className={styles.eyebrow}>Begin with confidence</p>
            <h2>Begin with confidence</h2>
            <p>Your next useful action is one click away. Apply if you are new, register if you need an account, login if you already belong, or track a submitted application.</p>
            <div className={styles.finalActions}>
              <Link href="/register" className={styles.finalPrimary}><FileText size={18} /> Apply / Register</Link>
              <Link href="/login" className={styles.finalSecondary}><LogIn size={18} /> Login</Link>
              <Link href="/track" className={styles.finalSecondary}><Search size={18} /> Track progress of your application</Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
