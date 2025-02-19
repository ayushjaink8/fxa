import React, {
  useEffect,
  useContext,
  useMemo,
  useState,
  useCallback,
  Suspense,
} from 'react';
import { connect } from 'react-redux';
import { Localized, useLocalization } from '@fluent/react';
import classNames from 'classnames';

import { AppContext } from '../../lib/AppContext';
import { useMatchMedia, useNonce, usePaypalButtonSetup } from '../../lib/hooks';
import { getSelectedPlan } from '../../lib/plan';
import useValidatorState, {
  State as ValidatorState,
} from '../../lib/validator';

import { LoadingOverlay } from '../../components/LoadingOverlay';
import { PlanErrorDialog } from '../../components/PlanErrorDialog';
import NewUserEmailForm, {
  checkAccountExists,
} from '../../components/NewUserEmailForm';
import Header from '../../components/Header';
import { Form } from '../../components/fields';
import PaymentProcessing from '../../components/PaymentProcessing';
import SubscriptionTitle from '../../components/SubscriptionTitle';
import PlanDetails from '../../components/PlanDetails';
import TermsAndPrivacy from '../../components/TermsAndPrivacy';
import PaymentLegalBlurb from '../../components/PaymentLegalBlurb';
import { PaymentConsentCheckbox } from '../../components/PaymentConsentCheckbox';

import { State } from '../../store/state';
import { sequences, SequenceFunctions } from '../../store/sequences';
import { selectors, SelectorReturns } from '../../store/selectors';
import { Customer, Profile } from '../../store/types';

import AcceptedCards from '../Product/AcceptedCards';

import './index.scss';
import PaymentForm, {
  StripePaymentSubmitResult,
  StripePaymentUpdateResult,
  StripeSubmitHandler,
  StripeUpdateHandler,
} from '../../components/PaymentForm';
import PaymentErrorView from '../../components/PaymentErrorView';
import SubscriptionSuccess from '../Product/SubscriptionSuccess';

import * as Amplitude from '../../lib/amplitude';
import {
  handlePasswordlessSubscription,
  PaymentError,
  RetryStatus,
  SubscriptionCreateStripeAPIs,
} from '../../lib/stripe';
import { GeneralError } from '../../lib/errors';
import { handlePasswordlessSignUp } from '../../lib/account';
import { handleNewsletterSignup } from '../../lib/newsletter';
import { apiFetchCustomer, apiFetchProfile } from '../../lib/apiClient';
import * as apiClient from '../../lib/apiClient';
import sentry from '../../lib/sentry';
import { ButtonBaseProps } from '../../components/PayPalButton';
import { AlertBar } from '../../components/AlertBar';

const PaypalButton = React.lazy(() => import('../../components/PayPalButton'));

const NewsletterErrorAlertBar = () => {
  return (
    <AlertBar className="alert newsletter-error">
      <Localized id="newsletter-signup-error">
        <span data-testid="newsletter-signup-error-message">
          You're not signed up for product update emails. You can try again in
          your account settings.
        </span>
      </Localized>
    </AlertBar>
  );
};

export type CheckoutProps = {
  match: {
    params: {
      productId: string;
    };
  };
  plans: SelectorReturns['plans'];
  plansByProductId: SelectorReturns['plansByProductId'];
  fetchCheckoutRouteResources: SequenceFunctions['fetchCheckoutRouteResources'];
  validatorInitialState?: ValidatorState;
  stripeOverride?: SubscriptionCreateStripeAPIs;
  paypalButtonBase?: React.FC<ButtonBaseProps>;
};

export const Checkout = ({
  match: {
    params: { productId },
  },
  plans,
  plansByProductId,
  fetchCheckoutRouteResources,
  validatorInitialState,
  stripeOverride,
  paypalButtonBase,
}: CheckoutProps) => {
  const { config, locationReload, queryParams, matchMediaDefault } =
    useContext(AppContext);
  const { l10n } = useLocalization();
  const checkboxValidator = useValidatorState();
  const [submitNonce, refreshSubmitNonce] = useNonce();
  const [inProgress, setInProgress] = useState(false);
  const [retryStatus, setRetryStatus] = useState<RetryStatus>();
  const [subscriptionError, setSubscriptionError] = useState<
    PaymentError | GeneralError
  >();
  const [profile, setProfile] = useState<Profile>();
  const [customer, setCustomer] = useState<Customer>();
  const isMobile = !useMatchMedia('(min-width: 768px)', matchMediaDefault);
  const [transactionInProgress, setTransactionInProgress] = useState(false);
  const [checkboxSet, setCheckboxSet] = useState(false);
  const [validEmail, setValidEmail] = useState<string>('');
  const [accountExists, setAccountExists] = useState(false);
  const [emailsMatch, setEmailsMatch] = useState(false);
  const [paypalScriptLoaded, setPaypalScriptLoaded] = useState(false);
  const [subscribeToNewsletter, toggleSubscribeToNewsletter] = useState(false);
  const [newsletterSignupError, setNewsletterSignupError] = useState(false);

  // Fetch plans on initial render or change in product ID
  useEffect(() => {
    fetchCheckoutRouteResources();
  }, [fetchCheckoutRouteResources]);
  usePaypalButtonSetup(config, setPaypalScriptLoaded, paypalButtonBase);

  const signInQueryParams = { ...queryParams, signin: 'yes' };
  const signInQueryParamString = Object.entries(signInQueryParams)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const planId = queryParams.plan;
  const signInURL = `${config.servers.content.url}/subscriptions/products/${productId}?${signInQueryParamString}`;
  const selectedPlan = useMemo(
    () => getSelectedPlan(productId, planId, plansByProductId),
    [productId, planId, plansByProductId]
  );

  const onFormMounted = useCallback(
    () => Amplitude.createSubscriptionMounted(selectedPlan),
    [selectedPlan]
  );

  const onFormEngaged = useCallback(
    () => Amplitude.createSubscriptionEngaged(selectedPlan),
    [selectedPlan]
  );

  // clear any error rendered with `ErrorMessage` on form change
  const onChange = useCallback(() => {
    if (subscriptionError) {
      setSubscriptionError(undefined);
    }
  }, [subscriptionError, setSubscriptionError]);

  const onStripeSubmit: StripeSubmitHandler | StripeUpdateHandler = useCallback(
    async ({
      stripe: stripeFormParams,
      ...params
    }: StripePaymentSubmitResult | StripePaymentUpdateResult) => {
      setInProgress(true);
      try {
        await handlePasswordlessSubscription({
          ...params,
          ...apiClient,
          email: validEmail,
          clientId: config.servers.oauth.clientId,
          customer: null,
          stripe: stripeOverride || stripeFormParams,
          selectedPlan,
          retryStatus,
          onSuccess: fetchProfileAndCustomer,
          onFailure: setSubscriptionError,
          onRetry: (status: RetryStatus) => {
            setRetryStatus(status);
            setSubscriptionError({ type: 'card_error', code: 'card_declined' });
          },
        });
        Amplitude.createSubscriptionWithPaymentMethod_FULFILLED(selectedPlan);
        if (subscribeToNewsletter) {
          await handleNewsletterSignup();
        }
      } catch (error) {
        if (error.code === 'fxa_newsletter_signup_error') {
          setNewsletterSignupError(true);
        } else {
          // Some Stripe APIs like `createPaymentMethod` return an object with
          // an error property on error.
          setSubscriptionError(error?.error || error);
        }
      }
      setInProgress(false);
      refreshSubmitNonce();
    },
    [
      refreshSubmitNonce,
      validEmail,
      config.servers.oauth.clientId,
      stripeOverride,
      selectedPlan,
      retryStatus,
      subscribeToNewsletter,
    ]
  );

  const postSubscriptionAttemptPaypalCallback = useCallback(async () => {
    await fetchProfileAndCustomer();
    if (subscribeToNewsletter) {
      try {
        await handleNewsletterSignup();
      } catch (error) {
        // If both fetchProfileAndCustomer and handleNewsletterSignup fail,
        // there would be an AlertBar on top of the PaymentErrorView screen.
        setNewsletterSignupError(true);
      }
    }
  }, [subscribeToNewsletter]);

  const beforePaypalCreateOrder = useCallback(async () => {
    await handlePasswordlessSignUp({
      email: validEmail,
      clientId: config.servers.oauth.clientId,
    });
  }, [config.servers.oauth.clientId, validEmail]);

  if (plans.loading) {
    return <LoadingOverlay isLoading={true} />;
  }

  if (!plans.result || plans.error !== null || !selectedPlan) {
    return <PlanErrorDialog locationReload={locationReload} plans={plans} />;
  }

  async function fetchProfileAndCustomer() {
    try {
      const [profile, customer] = await Promise.all([
        apiFetchProfile(),
        apiFetchCustomer(),
      ]);
      setProfile(profile);
      setCustomer(customer);
      // Our stub accounts have a uid, append it to all future metric
      // events
      Amplitude.addGlobalEventProperties({ uid: profile.uid });
    } catch (e) {
      sentry.captureException(e);
      setSubscriptionError({ code: 'fxa_fetch_profile_customer_error' });
    }
  }

  if (profile && customer) {
    return (
      <>
        {newsletterSignupError && <NewsletterErrorAlertBar />}
        <SubscriptionSuccess
          {...{
            plan: selectedPlan,
            customer,
            profile,
            isMobile,
            accountExists,
          }}
        />
      </>
    );
  }

  return (
    <>
      <Header />
      <div className="main-content">
        {newsletterSignupError && <NewsletterErrorAlertBar />}
        <PaymentErrorView
          error={subscriptionError}
          onRetry={() => {
            setSubscriptionError(undefined);
            setTransactionInProgress(false);
          }}
          className={classNames({
            hidden: !subscriptionError,
          })}
          plan={selectedPlan}
          isPasswordlessCheckout={true}
        />
        <PaymentProcessing
          provider="paypal"
          className={classNames({
            hidden: !transactionInProgress || subscriptionError,
          })}
        />
        <SubscriptionTitle
          screenType="create"
          className={classNames({
            hidden: transactionInProgress || subscriptionError,
          })}
        />
        <div
          className={classNames('product-payment', {
            hidden: transactionInProgress || subscriptionError,
          })}
          data-testid="subscription-create"
        >
          <Localized id="new-user-step-1">
            <h2 className="step-header">1. Create a Firefox account</h2>
          </Localized>
          <hr />
          <NewUserEmailForm
            setValidEmail={setValidEmail}
            signInURL={signInURL}
            setAccountExists={setAccountExists}
            checkAccountExists={checkAccountExists}
            setEmailsMatch={setEmailsMatch}
            getString={l10n.getString.bind(l10n)}
            selectedPlan={selectedPlan}
            onToggleNewsletterCheckbox={() =>
              toggleSubscribeToNewsletter(!subscribeToNewsletter)
            }
          />

          <hr />
          <Localized id="new-user-step-2">
            <h2 className="step-header">2. Choose your payment method</h2>
          </Localized>
          <Localized id="new-user-required-payment-consent">
            <strong>Required</strong>
          </Localized>
          <Form validator={checkboxValidator}>
            <PaymentConsentCheckbox
              plan={selectedPlan}
              onClick={() => setCheckboxSet(!checkboxSet)}
            />
          </Form>
          <>
            {paypalScriptLoaded && (
              <>
                <div
                  className="subscription-create-pay-with-other"
                  data-testid="pay-with-other"
                >
                  <Suspense fallback={<div>Loading...</div>}>
                    <div className="paypal-button">
                      <PaypalButton
                        beforeCreateOrder={beforePaypalCreateOrder}
                        currencyCode={selectedPlan.currency}
                        customer={null}
                        disabled={
                          !checkboxSet ||
                          validEmail === '' ||
                          accountExists ||
                          !emailsMatch
                        }
                        idempotencyKey={submitNonce}
                        newPaypalAgreement={true}
                        priceId={selectedPlan.plan_id}
                        refreshSubmitNonce={refreshSubmitNonce}
                        postSubscriptionAttemptPaypalCallback={
                          postSubscriptionAttemptPaypalCallback
                        }
                        setSubscriptionError={setSubscriptionError}
                        setTransactionInProgress={setTransactionInProgress}
                        ButtonBase={paypalButtonBase}
                      />
                    </div>
                  </Suspense>
                </div>
                <div>
                  <Localized id="pay-with-heading-card-or">
                    <p className="pay-with-heading">Or pay with card</p>
                  </Localized>
                  <AcceptedCards />
                </div>
              </>
            )}
            {!paypalScriptLoaded && (
              <div>
                <Localized id="pay-with-heading-card-only">
                  <p className="pay-with-heading">Pay with card</p>
                </Localized>
                <AcceptedCards />
              </div>
            )}
          </>
          <div>
            <h3 className="billing-title">
              <Localized id="new-user-card-title">
                <span className="title">Enter your card information</span>
              </Localized>
            </h3>
            <PaymentForm
              {...{
                submitNonce,
                onSubmit: onStripeSubmit,
                onChange,
                submitButtonL10nId: 'new-user-submit',
                submitButtonCopy: 'Subscribe Now',
                shouldAllowSubmit:
                  checkboxSet &&
                  validEmail !== '' &&
                  !accountExists &&
                  emailsMatch,

                inProgress,
                validatorInitialState,
                confirm: false,
                submit: true,
                plan: selectedPlan,
                onMounted: onFormMounted,
                onEngaged: onFormEngaged,
              }}
            />
          </div>

          <div className="subscription-create-footer">
            <>
              <PaymentLegalBlurb provider={undefined} />
              <TermsAndPrivacy
                showFXALinks={!accountExists}
                plan={selectedPlan}
                contentServerURL={config.servers.content.url}
              />
            </>
          </div>
        </div>
        <PlanDetails
          {...{
            className: classNames('default', {
              hidden: transactionInProgress && isMobile,
            }),
            selectedPlan,
            isMobile,
            showExpandButton: isMobile,
          }}
        />
      </div>
    </>
  );
};

export default connect(
  (state: State) => ({
    plans: selectors.plans(state),
    plansByProductId: selectors.plansByProductId(state),
  }),
  {
    fetchCheckoutRouteResources: sequences.fetchCheckoutRouteResources,
  }
)(Checkout);
