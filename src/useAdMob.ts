import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentStatus,
  BannerAdPluginEvents,
  BannerAdPosition,
  BannerAdSize,
  MaxAdContentRating,
  type AdmobConsentInfo,
} from '@capacitor-community/admob';

const IOS_PRODUCTION_BANNER_ID = 'ca-app-pub-5307701268996147/4215508334';
const IOS_TEST_BANNER_ID = 'ca-app-pub-3940256099942544/2435281174';
const ANDROID_BANNER_ID = 'ca-app-pub-5307701268996147/2219900388';
const IOS_TEST_MODE = import.meta.env.VITE_IOS_TEST_ADS === 'true';

export type AdState = 'unavailable' | 'initializing' | 'ready' | 'limited' | 'error';
export type AdBannerState = 'hidden' | 'loading' | 'visible' | 'failed';

const setBannerHeight = (height: number) => {
  document.documentElement.style.setProperty('--ad-banner-height', `${Math.max(0, height)}px`);
};

export function useAdMob(shouldDisplay: boolean) {
  const [state, setState] = useState<AdState>(Capacitor.isNativePlatform() ? 'initializing' : 'unavailable');
  const [privacyOptionsRequired, setPrivacyOptionsRequired] = useState(false);
  const [canRequestAds, setCanRequestAds] = useState(false);
  const [bannerState, setBannerState] = useState<AdBannerState>('hidden');
  const [errorMessage, setErrorMessage] = useState('');
  const desiredVisible = useRef(false);
  const bannerCreated = useRef(false);
  const bannerVisible = useRef(false);
  const operation = useRef<Promise<void>>(Promise.resolve());
  const active = useRef(true);
  const synchronizeRef = useRef<() => void>(() => undefined);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateConsentState = useCallback((info: AdmobConsentInfo) => {
    if (!active.current) return;
    setCanRequestAds(info.canRequestAds);
    setPrivacyOptionsRequired(info.privacyOptionsRequirementStatus === 'REQUIRED');
    setState(info.canRequestAds ? 'ready' : 'limited');
    setErrorMessage('');
  }, []);

  const removeBanner = useCallback(async () => {
    try { await AdMob.removeBanner(); } catch { /* Banner may not exist yet. */ }
    bannerCreated.current = false;
    bannerVisible.current = false;
    setBannerHeight(0);
    setBannerState('hidden');
  }, []);

  const scheduleBannerRetry = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      if (active.current && desiredVisible.current) synchronizeRef.current();
    }, 30000);
  }, []);

  const synchronizeBanner = useCallback(() => {
    operation.current = operation.current
      .catch(() => undefined)
      .then(async () => {
        if (!active.current || !Capacitor.isNativePlatform()) return;
        if (desiredVisible.current) {
          if (bannerCreated.current) {
            if (!bannerVisible.current) await AdMob.resumeBanner();
          } else {
            setBannerState('loading');
            setErrorMessage('');
            const platform = Capacitor.getPlatform();
            const useIosTestAds = platform === 'ios' && IOS_TEST_MODE;
            const adId = platform === 'ios'
              ? useIosTestAds ? IOS_TEST_BANNER_ID : IOS_PRODUCTION_BANNER_ID
              : ANDROID_BANNER_ID;
            await AdMob.showBanner({
              adId,
              adSize: BannerAdSize.ADAPTIVE_BANNER,
              position: BannerAdPosition.BOTTOM_CENTER,
              margin: 0,
              isTesting: useIosTestAds,
            });
            bannerCreated.current = true;
          }
          bannerVisible.current = true;
        } else if (bannerVisible.current) {
          await AdMob.hideBanner();
          bannerVisible.current = false;
          setBannerHeight(0);
          setBannerState('hidden');
        }
      })
      .catch((error: unknown) => {
        bannerCreated.current = false;
        bannerVisible.current = false;
        setBannerHeight(0);
        setBannerState('failed');
        setErrorMessage(error instanceof Error ? error.message : String(error));
        scheduleBannerRetry();
      });
  }, [scheduleBannerRetry]);

  synchronizeRef.current = synchronizeBanner;

  const requestConsent = useCallback(async () => {
    await AdMob.initialize({
      initializeForTesting: Capacitor.getPlatform() === 'ios' && IOS_TEST_MODE,
      tagForChildDirectedTreatment: false,
      maxAdContentRating: MaxAdContentRating.General,
    });
    let info = await AdMob.requestConsentInfo();
    if (info.status === AdmobConsentStatus.REQUIRED && info.isConsentFormAvailable) {
      info = await AdMob.showConsentForm();
    }
    if (Capacitor.getPlatform() === 'ios') {
      const tracking = await AdMob.trackingAuthorizationStatus();
      if (tracking.status === 'notDetermined') {
        await AdMob.requestTrackingAuthorization();
      }
    }
    updateConsentState(info);
    return info;
  }, [updateConsentState]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    active.current = true;
    const listeners: PluginListenerHandle[] = [];

    const initialize = async () => {
      try {
        listeners.push(await AdMob.addListener(BannerAdPluginEvents.SizeChanged, ({ height }) => {
          if (desiredVisible.current) setBannerHeight(height);
        }));
        listeners.push(await AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
          if (active.current && desiredVisible.current) setBannerState('visible');
        }));
        listeners.push(await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (error) => {
          bannerCreated.current = false;
          bannerVisible.current = false;
          setBannerHeight(0);
          setBannerState('failed');
          setErrorMessage(error.message);
          void AdMob.removeBanner().catch(() => undefined);
          scheduleBannerRetry();
        }));
        await requestConsent();
      } catch (error: unknown) {
        if (active.current) {
          setState('error');
          setErrorMessage(error instanceof Error ? error.message : String(error));
        }
      }
    };

    void initialize();
    return () => {
      active.current = false;
      desiredVisible.current = false;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      setBannerHeight(0);
      void removeBanner();
      for (const listener of listeners) void listener.remove();
    };
  }, [removeBanner, requestConsent, scheduleBannerRetry]);

  useEffect(() => {
    desiredVisible.current = shouldDisplay && canRequestAds;
    synchronizeBanner();
  }, [canRequestAds, shouldDisplay, synchronizeBanner]);

  const showPrivacyOptions = useCallback(async () => {
    if (!privacyOptionsRequired) return;
    try {
      await AdMob.showPrivacyOptionsForm();
      const info = await AdMob.requestConsentInfo();
      updateConsentState(info);
      await removeBanner();
      synchronizeBanner();
    } catch (error: unknown) {
      if (active.current) {
        setState('error');
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    }
  }, [privacyOptionsRequired, removeBanner, synchronizeBanner, updateConsentState]);

  const testMode = Capacitor.getPlatform() === 'ios' && IOS_TEST_MODE;
  return { state, bannerState, errorMessage, privacyOptionsRequired, testMode, showPrivacyOptions };
}
