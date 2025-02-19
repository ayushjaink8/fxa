import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Localized } from '@fluent/react';
import debounce from 'lodash.debounce';

import { isEmailValid } from '../../../../fxa-shared/email/helpers';

import shieldIcon from './images/shield.svg';

import { Form, Input, Checkbox } from '../fields';
import {
  State as ValidatorState,
  useValidatorState,
  MiddlewareReducer as ValidatorMiddlewareReducer,
} from '../../lib/validator';

import './index.scss';
import * as Amplitude from '../../lib/amplitude';
import { useCallbackOnce } from '../../lib/hooks';
import { apiFetchAccountStatus } from '../../lib/apiClient';

export type NewUserEmailFormProps = {
  getString?: (id: string) => string;
  signInURL: string;
  setValidEmail: (value: string) => void;
  setAccountExists: (value: boolean) => void;
  setEmailsMatch: (value: boolean) => void;
  checkAccountExists: (email: string) => Promise<{ exists: boolean }>;
  onToggleNewsletterCheckbox: () => void;
  validatorInitialState?: ValidatorState;
  validatorMiddlewareReducer?: ValidatorMiddlewareReducer;
  selectedPlan: any;
};

export const NewUserEmailForm = ({
  getString,
  signInURL,
  setValidEmail,
  setAccountExists,
  setEmailsMatch,
  checkAccountExists,
  onToggleNewsletterCheckbox,
  validatorInitialState,
  validatorMiddlewareReducer,
  selectedPlan,
}: NewUserEmailFormProps) => {
  const validator = useValidatorState({
    initialState: validatorInitialState,
    middleware: validatorMiddlewareReducer,
  });

  const [emailInputState, setEmailInputState] = useState<string>();

  selectedPlan.checkoutType = 'without-account';

  const onFormMounted = useCallback(
    () => Amplitude.createAccountMounted(selectedPlan),
    [selectedPlan]
  );
  useEffect(() => {
    onFormMounted();
  }, [onFormMounted, selectedPlan]);

  const onFormEngaged = useCallbackOnce(
    () => Amplitude.createAccountEngaged(selectedPlan),
    [selectedPlan]
  );
  const onChange = useCallback(() => {
    onFormEngaged();
  }, [onFormEngaged]);

  const debouncedCheckAccountExists = useMemo(
    () => debounce((email: string) => checkAccountExists(email), 300),
    []
  );

  return (
    <Form
      data-testid="new-user-email-form"
      validator={validator}
      className="new-user-email-form"
      {...{ onChange }}
    >
      <Localized
        id="new-user-sign-in-link"
        elems={{ a: <a href={signInURL}></a> }}
      >
        <p className="sign-in-copy" data-testid="sign-in-copy">
          Already have a Firefox account?{' '}
          <a data-testid="sign-in-link" href={signInURL}>
            Sign in
          </a>
        </p>
      </Localized>
      <Localized id="new-user-email" attrs={{ placeholder: true, label: true }}>
        <Input
          type="email"
          name="new-user-email"
          label="Enter your email"
          data-testid="new-user-email"
          placeholder="foxy@mozilla.com"
          required
          spellCheck={false}
          onValidatePromise={(value: string, focused: boolean) =>
            emailInputValidationAndAccountCheck(
              value,
              focused,
              setValidEmail,
              setAccountExists,
              setEmailInputState,
              debouncedCheckAccountExists,
              signInURL,
              getString
            )
          }
        />
      </Localized>

      <Localized id="new-user-confirm-email" attrs={{ label: true }}>
        <Input
          type="email"
          name="new-user-confirm-email"
          label="Confirm your email"
          data-testid="new-user-confirm-email"
          required
          spellCheck={false}
          onValidate={(value: string, focused: boolean) =>
            emailConfirmationValidation(
              value,
              focused,
              emailInputState,
              setEmailsMatch,
              getString
            )
          }
        />
      </Localized>

      <Localized id="new-user-subscribe-product-updates">
        <Checkbox
          data-testid="new-user-subscribe-product-updates"
          name="new-user-subscribe-product-updates"
          onClick={onToggleNewsletterCheckbox}
        >
          I'd like to receive product updates from Firefox
        </Checkbox>
      </Localized>

      <div className="assurance-copy" data-testid="assurance-copy">
        <img src={shieldIcon} alt="shield" />
        <Localized id="new-user-subscribe-product-assurance">
          <p>
            We only use your email to create your account. We will never sell it
            to a third party.
          </p>
        </Localized>
      </div>
    </Form>
  );
};

export async function checkAccountExists(userEmail: string) {
  return apiFetchAccountStatus(userEmail);
}

export async function emailInputValidationAndAccountCheck(
  value: string,
  focused: boolean,
  setValidEmail: (value: string) => void,
  setAccountExists: (value: boolean) => void,
  setEmailInputState: (value: string) => void,
  debouncedCheckAccountExists: (email: string) => Promise<{ exists: boolean }>,
  signInURL: string,
  getString?: (id: string) => string
) {
  let error = null;
  let valid = false;
  let hasAccount = false;
  setEmailInputState(value);
  if (isEmailValid(value)) {
    valid = true;
    setValidEmail(value);
    const response = await debouncedCheckAccountExists(value);
    if (response?.exists) {
      hasAccount = response.exists;
    }
    setAccountExists(hasAccount);
  } else {
    setValidEmail('');
  }

  const errorMsg = getString
    ? /* istanbul ignore next - not testing l10n here */
      getString('new-user-email-validate')
    : 'Email is not valid';

  const accountExistsMsg = (
    <Localized
      id="new-user-already-has-account-sign-in"
      elems={{ a: <a href={signInURL}></a> }}
    >
      <>
        You already have an account.{' '}
        <a data-testid="already-have-account-link" href={signInURL}>
          Sign in
        </a>
      </>
    </Localized>
  );

  if (!valid && !focused && errorMsg) {
    error = errorMsg;
  }

  if (hasAccount) {
    error = accountExistsMsg;
  }

  return {
    value,
    valid,
    error,
  };
}

export function emailConfirmationValidation(
  value: string,
  focused: boolean,
  emailInputState: string | undefined,
  setEmailsMatch: (value: boolean) => void,
  getString?: Function
) {
  let valid = false;

  setEmailsMatch((valid = emailInputState === value));

  const errorMsg = getString
    ? /* istanbul ignore next - not testing l10n here */
      getString('new-user-email-validate-confirm')
    : 'Emails do not match';

  return {
    value,
    valid,
    error: !valid && !focused ? errorMsg : null,
  };
}

export default NewUserEmailForm;
