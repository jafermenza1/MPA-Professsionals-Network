# MPA App Store Packaging Readiness

**Assessment date:** 2026-10-16  
**Status:** Technically feasible; no native package has been created, signed, submitted or approved.

## Current repository state

The inspected application is a Next.js web app with a PWA manifest and install guidance. The current package manifests do not declare Capacitor or React Native, and this increment has not added Android/iOS project directories, signing configuration, store metadata or release workflows. The existing PWA install prompt installs the web app where the browser supports it; it does not produce a Play Store AAB/APK or an Apple App Store IPA.

The app uses a live backend and authenticated APIs. It is not safe to treat it as a static export: the web app must continue to use the deployed HTTPS origin and existing authentication/workflow services unless a separate native API configuration is intentionally designed.

## Recommended paths

### Android — Google Play

**Lowest-friction route:** package the hosted, production-ready PWA as a Trusted Web Activity (TWA), using Bubblewrap and Digital Asset Links. Google's official guide explains how Bubblewrap creates an Android project/AAB for a PWA and how the domain relationship is verified:
- https://developers.google.com/codelabs/pwa-in-play
- https://developer.android.com/develop/ui/views/layout/webapps/trusted-web-activities

Prerequisites:
- Stable HTTPS production domain, manifest, correctly sized app icons and reliable mobile navigation.
- Verified Digital Asset Links at /.well-known/assetlinks.json with the Play signing certificate fingerprint.
- Google Play developer account, unique application ID, signing key/Play App Signing, store listing, privacy policy, data-safety disclosures and testing track.
- Review of sign-in, account deletion where applicable, external links, uploads, notifications and connectivity/offline messaging on real Android devices.
- A release AAB and versioned build process; do not commit signing secrets.

A native Capacitor Android shell is also possible if MPA needs device APIs or richer native navigation. Capacitor officially supports adding Android and iOS platforms to an existing web project: https://capacitorjs.com/docs/getting-started.

### iOS — Apple App Store

**Recommended route:** a Capacitor iOS shell with an explicit app experience, rather than submitting the PWA as a bare web clip. Capacitor can bridge native capabilities while continuing to use the existing Next.js/backend deployment, subject to a carefully designed web/native boundary.

Apple's App Review Guidelines state that apps should provide features and UI beyond a repackaged website; minimum-functionality review is a material risk for a thin wrapper. See:
- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/app-store/review/

Before submission:
- Build and test the iOS target with Xcode on real devices; use a valid bundle ID, Apple Developer account, signing/provisioning and App Store Connect metadata.
- Add genuinely app-like value where appropriate: native share/open-in behavior, robust navigation/back handling, accessible mobile forms, native notifications only if their full authorization and privacy workflow is implemented, and reliable upload/camera behavior if used.
- Confirm privacy labels, account deletion/support links, reviewer demo credentials where allowed, and all production endpoints.
- Test session expiry, login/verification, low bandwidth, offline recovery, universal/deep links and safe handling of external URLs.
- Submit for review; approval is controlled by Apple and cannot be guaranteed.

## What is not yet ready

- No APK, AAB, IPA, native project, signing profile or store submission exists from this increment.
- PWA assets and the install nudge are not evidence of store readiness by themselves.
- Do not promise offline account actions: private API data and mutations remain online-only unless a separately reviewed offline design is implemented.
- App store packaging must follow exact-head validation of Increment 4, database migration review, production build and device tests.

## Proposed packaging sequence

1. Complete Increment 4 acceptance and apply/test the saved-items migration in a controlled test environment.
2. Confirm production domain, app name, icons (including 512px PNG and Apple touch assets), privacy policy, support URL, account-deletion policy and app identifiers.
3. Choose a shared Capacitor native wrapper for Android+iOS if the product needs native capabilities; choose Android TWA only if Android-first, hosted-web behavior is sufficient.
4. Add native project files and CI signing/build workflows without storing signing keys in GitHub source.
5. Produce internal Android and iOS builds, test authentication and all critical workflows on real devices, then create store listing metadata and submit.
6. Record build numbers, artifact checksums, test evidence, review feedback and approved store URLs in this repository.

**Recommendation:** plan for **Capacitor for both stores** if the goal is one coordinated Android/iOS release and a stronger iOS review story. Keep the PWA as the immediate installable web channel. Do not generate release artifacts until the project owner explicitly authorizes native project creation and store packaging.
