/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* TODO: test translations with Fluent
 * NOTE: This file tests `email.js` and the MJML/EJS templates in `lib/senders/emails`.
 * Eventually we will retire `email.js` but as templates are being converted over to
 * the new stack, tests per template will be added, and then any other mailer tests
 * will be copied over.
 */

const ROOT_DIR = '../../..';

import { assert } from 'chai';
import mocks from '../../mocks';
import proxyquire from 'proxyquire';
import { URL } from 'url';

const config = require(`${ROOT_DIR}/config`).getProperties();
if (!config.smtp.sesConfigurationSet) {
  config.smtp.sesConfigurationSet = 'ses-config';
}

const TEMPLATE_VERSIONS = require(`${ROOT_DIR}/lib/senders/templates/_versions.json`);

const MESSAGE = {
  // Note: acceptLanguage is not just a single locale
  acceptLanguage: 'en;q=0.8,en-US;q=0.5,en;q=0.3"',
  appStoreLink: 'https://example.com/app-store',
  code: 'abc123',
  date: 'Wednesday, Apr 7, 2021',
  deviceId: 'foo',
  location: {
    city: 'Mountain View',
    country: 'USA',
    stateCode: 'CA',
  },
  email: 'b@c.com',
  flowBeginTime: Date.now(),
  flowId: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  ip: '219.129.234.194',
  locations: [],
  numberRemaining: 2,
  primaryEmail: 'c@d.com',
  service: 'sync',
  time: '5:48:20 PM (PDT)',
  timeZone: 'America/Los_Angeles',
  tokenCode: 'abc123',
  type: 'secondary',
  uaBrowser: 'Firefox',
  uaBrowserVersion: '70.0a1',
  uaOS: 'Windows',
  uaOSVersion: '10',
  uid: 'uid',
  unblockCode: 'AS6334PK',
};

// key = query param name, value = MESSAGE property name
const MESSAGE_PARAMS = new Map([
  ['code', 'code'],
  ['email', 'email'],
  ['primary_email_verified', 'email'],
  ['product_id', 'productId'],
  ['plan_id', 'planId'],
  ['secondary_email_verified', 'email'],
  ['service', 'service'],
  ['uid', 'uid'],
  ['unblockCode', 'unblockCode'],
]);

interface Test {
  test: 'equal' | 'include' | 'notInclude' | any;
  expected: string;
}

// prettier-ignore
const COMMON_TESTS = new Map<string, Test | any>([
  ['from', { test: 'equal', expected: config.smtp.sender }],
  ['sender', { test: 'equal', expected: config.smtp.sender }],
  [
    'headers',
    new Map([
      ['X-Device-Id', { test: 'equal', expected: MESSAGE.deviceId }],
      ['X-Email-Service', { test: 'equal', expected: 'fxa-auth-server' }],
      ['X-Flow-Begin-Time', { test: 'equal', expected: MESSAGE.flowBeginTime }],
      ['X-Flow-Id', { test: 'equal', expected: MESSAGE.flowId }],
      ['X-Service-Id', { test: 'equal', expected: MESSAGE.service }],
      [
        'X-SES-CONFIGURATION-SET',
        { test: 'equal', expected: config.smtp.sesConfigurationSet },
      ],
      ['X-Uid', { test: 'equal', expected: MESSAGE.uid }],
    ]),
  ],
  [
    'text',
    [
      // Ensure no HTML character entities appear in plaintext emails, &amp; etc
      { test: 'notMatch', expected: /(?:&#x?[0-9a-f]+;)|(?:&[a-z]+;)/i },
    ],
  ],
]);

// prettier-ignore
const TESTS: [string, any][] = [
  ['cadReminderFirstEmail', new Map<string, Test | any>([
    ['subject', { test: 'equal', expected: 'Your Friendly Reminder: How To Complete Your Sync Setup' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('syncUrl', 'cad-reminder-first', 'connect-device') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('cadReminderFirst') }],
      ['X-Template-Name', { test: 'equal', expected: 'cadReminderFirst' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.cadReminderFirst }],
    ])],
    ['html', [
      { test: 'include', expected: "Here's your reminder to sync devices." },
      { test: 'include', expected: 'It takes two to sync. Syncing another device with Firefox privately keeps your bookmarks, passwords and other Firefox data the same everywhere you use Firefox.' },
      { test: 'include', expected: decodeUrl(configHref('syncUrl', 'cad-reminder-first', 'connect-device')) },
      { test: 'include', expected: decodeUrl(config.smtp.androidUrl) },
      { test: 'include', expected: decodeUrl(config.smtp.iosUrl) },
      { test: 'include', expected: 'another device' },
      { test: 'include', expected: decodeUrl(configHref('privacyUrl', 'cad-reminder-first', 'privacy')) },
      { test: 'include', expected: decodeUrl(configHref('supportUrl', 'cad-reminder-first', 'support')) },
      { test: 'notInclude', expected: config.smtp.firefoxDesktopUrl },
    ]],
    ['text', [
      { test: 'include', expected: "Here's your reminder to sync devices." },
      { test: 'include', expected: 'It takes two to sync. Syncing another device with Firefox privately keeps your bookmarks, passwords and other Firefox data the same everywhere you use Firefox.' },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'cad-reminder-first', 'privacy')}` },
      { test: 'include', expected: config.smtp.syncUrl },
      { test: 'notInclude', expected: config.smtp.androidUrl },
      { test: 'notInclude', expected: config.smtp.iosUrl },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],

  ['cadReminderSecondEmail', new Map<string, Test | any>([
    ['subject', { test: 'equal', expected: 'Final Reminder: Complete Sync Setup' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('syncUrl', 'cad-reminder-second', 'connect-device') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('cadReminderSecond') }],
      ['X-Template-Name', { test: 'equal', expected: 'cadReminderSecond' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.cadReminderSecond }],
    ])],
    ['html', [
      { test: 'include', expected: 'Last reminder to sync devices!' },
      { test: 'include', expected: 'Syncing another device with Firefox privately keeps your bookmarks, passwords and other Firefox data the same everywhere you use Firefox.' },
      { test: 'include', expected: decodeUrl(configHref('syncUrl', 'cad-reminder-second', 'connect-device')) },
      { test: 'include', expected: decodeUrl(config.smtp.androidUrl) },
      { test: 'include', expected: decodeUrl(config.smtp.iosUrl) },
      { test: 'include', expected: decodeUrl(configHref('privacyUrl', 'cad-reminder-second', 'privacy')) },
      { test: 'include', expected: decodeUrl(configHref('supportUrl', 'cad-reminder-second', 'support')) },
    ]],
    ['text', [
      { test: 'include', expected: 'Last reminder to sync devices!' },
      { test: 'include', expected: 'Syncing another device with Firefox privately keeps your bookmarks, passwords and other Firefox data the same everywhere you use Firefox.' },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'cad-reminder-second', 'privacy')}` },
      { test: 'include', expected: config.smtp.syncUrl },
      { test: 'notInclude', expected: config.smtp.androidUrl },
      { test: 'notInclude', expected: config.smtp.iosUrl },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],

  ['lowRecoveryCodesEmail', new Map<string, Test | any>([
    ['subject', [
      { test: 'include', expected: '2 recovery codes remaining' }
    ]],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('accountRecoveryCodesUrl', 'low-recovery-codes', 'recovery-codes', 'low_recovery_codes=true', 'email', 'uid') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('lowRecoveryCodes') }],
      ['X-Template-Name', { test: 'equal', expected: 'lowRecoveryCodes' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.lowRecoveryCodes }],
    ])],
    ['html', [
      { test: 'include', expected: decodeUrl(configHref('accountRecoveryCodesUrl', 'low-recovery-codes', 'recovery-codes', 'low_recovery_codes=true', 'email', 'uid')) },
      { test: 'include', expected: decodeUrl(configHref('privacyUrl', 'low-recovery-codes', 'privacy')) },
      { test: 'include', expected: decodeUrl(configHref('supportUrl', 'low-recovery-codes', 'support')) },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Generate codes:\n${configUrl('accountRecoveryCodesUrl', 'low-recovery-codes', 'recovery-codes', 'low_recovery_codes=true', 'email', 'uid')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'low-recovery-codes', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'low-recovery-codes', 'support')}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],

  ['postVerifyEmail', new Map<string, Test | any>([
    ['subject', { test: 'equal', expected: 'Account verified. Next, sync another device to finish setup' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('syncUrl', 'account-verified', 'connect-device') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('postVerify') }],
      ['X-Template-Name', { test: 'equal', expected: 'postVerify' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.postVerify }],
    ])],
    ['html', [
      { test: 'include', expected: "Firefox Account verified. You're almost there." },
      { test: 'include', expected: 'Next sync between your devices!' },
      { test: 'include', expected: 'Sync privately keeps your bookmarks, passwords and other Firefox data the same across all your devices.' },
      { test: 'include', expected: decodeUrl(configHref('syncUrl', 'account-verified', 'connect-device')) },
      { test: 'include', expected: decodeUrl(config.smtp.androidUrl) },
      { test: 'include', expected: decodeUrl(config.smtp.iosUrl) },
      { test: 'include', expected: 'another desktop device' },
      { test: 'include', expected: decodeUrl(configHref('privacyUrl', 'account-verified', 'privacy')) },
      { test: 'include', expected: decodeUrl(configHref('supportUrl', 'account-verified', 'support')) },
      { test: 'include', expected: decodeUrl(config.smtp.firefoxDesktopUrl) },
    ]],
    ['text', [
      { test: 'include', expected: 'Firefox Account verified. You\'re almost there.' },
      { test: 'include', expected: 'Next sync between your devices!' },
      { test: 'include', expected: 'Sync privately keeps your bookmarks, passwords and other Firefox data the same across all your devices.' },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'account-verified', 'privacy')}` },
      { test: 'include', expected: `Have questions? Visit` },
      { test: 'include', expected: configUrl('supportUrl', 'account-verified', 'support') },
      { test: 'include', expected: config.smtp.syncUrl },
      { test: 'notInclude', expected: config.smtp.androidUrl },
      { test: 'notInclude', expected: config.smtp.iosUrl },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],

  ['postRemoveSecondaryEmail', new Map<string, Test | any>([
    ['subject', { test: 'equal', expected: 'Secondary email removed' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('accountSettingsUrl', 'account-email-removed', 'account-email-removed', 'email', 'uid') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('postRemoveSecondary') }],
      ['X-Template-Name', { test: 'equal', expected: 'postRemoveSecondary' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.postRemoveSecondary }],
    ])],
    ['html', [
      { test: 'include', expected: decodeUrl(configHref('accountSettingsUrl', 'account-email-removed', 'account-email-removed', 'email', 'uid')) },
      { test: 'include', expected: decodeUrl(configHref('privacyUrl', 'account-email-removed', 'privacy')) },
      { test: 'include', expected: decodeUrl(configHref('supportUrl', 'account-email-removed', 'support')) },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Manage account:\n${configUrl('accountSettingsUrl', 'account-email-removed', 'account-email-removed', 'email', 'uid')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'account-email-removed', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'account-email-removed', 'support')}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],

  ['verificationReminderFirstEmail', new Map<string, Test | any>([
    ['subject', { test: 'equal', expected: 'Reminder: Finish creating your account' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('verificationUrl', 'first-verification-reminder', 'confirm-email', 'code', 'reminder=first', 'uid') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('verificationReminderFirst') }],
      ['X-Template-Name', { test: 'equal', expected: 'verificationReminderFirst' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.verificationReminderFirst }],
      ['X-Verify-Code', { test: 'equal', expected: MESSAGE.code }],
    ])],
    ['html', [
      { test: 'include', expected: decodeUrl(configHref('privacyUrl', 'first-verification-reminder', 'privacy')) },
      { test: 'include', expected: decodeUrl(configHref('supportUrl', 'first-verification-reminder', 'support')) },
      { test: 'include', expected: decodeUrl(configHref('verificationUrl', 'first-verification-reminder', 'confirm-email', 'code', 'reminder=first', 'uid')) },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'first-verification-reminder', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'first-verification-reminder', 'support')}` },
      { test: 'include', expected: `Confirm email:\n${configUrl('verificationUrl', 'first-verification-reminder', 'confirm-email', 'code', 'reminder=first', 'uid')}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],

  ['verificationReminderSecondEmail', new Map<string, Test | any>([
    ['subject', { test: 'equal', expected: 'Final reminder: Activate your account' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('verificationUrl', 'second-verification-reminder', 'confirm-email', 'code', 'reminder=second', 'uid') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('verificationReminderSecond') }],
      ['X-Template-Name', { test: 'equal', expected: 'verificationReminderSecond' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.verificationReminderSecond }],
      ['X-Verify-Code', { test: 'equal', expected: MESSAGE.code }],
    ])],
    ['html', [
      { test: 'include', expected: decodeUrl(configHref('privacyUrl', 'second-verification-reminder', 'privacy')) },
      { test: 'include', expected: decodeUrl(configHref('supportUrl', 'second-verification-reminder', 'support')) },
      { test: 'include', expected: decodeUrl(configHref('verificationUrl', 'second-verification-reminder', 'confirm-email', 'code', 'reminder=second', 'uid')) },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'second-verification-reminder', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'second-verification-reminder', 'support')}` },
      { test: 'include', expected: `Confirm email:\n${configUrl('verificationUrl', 'second-verification-reminder', 'confirm-email', 'code', 'reminder=second', 'uid')}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],

  ['verifyEmail', new Map<string, Test | any>([
    ['subject', { test: 'equal', expected: 'Finish creating your account' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('verificationUrl', 'welcome', 'activate', 'uid', 'code', 'service') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('verify') }],
      ['X-Template-Name', { test: 'equal', expected: 'verify' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.verify }],
      ['X-Verify-Code', { test: 'equal', expected: MESSAGE.code }],
    ])],
    ['html', [
      { test: 'include', expected: 'Confirm your account and get the most out of Firefox everywhere you sign in starting with:' },
      { test: 'include', expected: decodeUrl(configHref('privacyUrl', 'welcome', 'privacy')) },
      { test: 'include', expected: decodeUrl(configHref('supportUrl', 'welcome', 'support')) },
      { test: 'include', expected: decodeUrl(configHref('verificationUrl', 'welcome', 'activate', 'uid', 'code', 'service')) },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: 'Confirm your account and get the most out of Firefox everywhere you sign in.' },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'welcome', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'welcome', 'support')}` },
      { test: 'include', expected: `Confirm email:\n${configUrl('verificationUrl', 'welcome', 'activate', 'uid', 'code', 'service')}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],

  ['verifyShortCodeEmail', new Map<string, Test | any>([
    ['subject', { test: 'equal', expected: `Verification code: ${MESSAGE.code}` }],
    ['headers', new Map([
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('verify') }],
      ['X-Template-Name', { test: 'equal', expected: 'verifyShortCode' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.verifyShortCode }],
      ['X-Verify-Short-Code', { test: 'equal', expected: MESSAGE.code }],
    ])],
    ['html', [
      { test: 'include', expected: decodeUrl(configHref('privacyUrl', 'welcome', 'privacy')) },
      { test: 'include', expected: decodeUrl(configHref('supportUrl', 'welcome', 'support')) },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'include', expected: `${MESSAGE.date}` },
      { test: 'include', expected: `${MESSAGE.time}` },
      { test: 'include', expected: 'If yes, use this verification code in your registration form:' },
      { test: 'include', expected: MESSAGE.code },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'welcome', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'welcome', 'support')}` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.date}` },
      { test: 'include', expected: `${MESSAGE.time}` },
      { test: 'include', expected: `If yes, use this verification code in your registration form:\n${MESSAGE.code}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],

  ['verifySecondaryCodeEmail', new Map<string, Test | any>([
    ['subject', { test: 'equal', expected: 'Confirm secondary email' }],
    ['headers', new Map([
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('verifySecondaryCode') }],
      ['X-Template-Name', { test: 'equal', expected: 'verifySecondaryCode' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.verifySecondaryCode }],
    ])],
    ['html', [
      { test: 'include', expected: decodeUrl(configHref('privacyUrl', 'welcome-secondary', 'privacy')) },
      { test: 'include', expected: decodeUrl(configHref('supportUrl', 'welcome-secondary', 'support')) },
      { test: 'include', expected: 'Verify secondary email' },
      { test: 'include', expected: `A request to use ${MESSAGE.email} as a secondary email address has been made from the following Firefox Account:` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'include', expected: 'Use this verification code:' },
      { test: 'include', expected: `${MESSAGE.code}` },
      { test: 'include', expected: 'It expires in 5 minutes. Once verified, this address will begin receiving security notifications and confirmations.' },
      { test: 'include', expected: `${MESSAGE.date}` },
      { test: 'include', expected: `${MESSAGE.time}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: configUrl('privacyUrl', 'welcome-secondary', 'privacy') },
      { test: 'include', expected: configUrl('supportUrl', 'welcome-secondary', 'support') },
      { test: 'include', expected: 'Verify secondary email' },
      { test: 'include', expected: `A request to use ${MESSAGE.email} as a secondary email address has been made from the following Firefox Account:` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'include', expected: 'Use this verification code:' },
      { test: 'include', expected: `${MESSAGE.code}` },
      { test: 'include', expected: 'It expires in 5 minutes. Once verified, this address will begin receiving security notifications and confirmations.' },
      { test: 'include', expected: `${MESSAGE.date}` },
      { test: 'include', expected: `${MESSAGE.time}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],

  ['passwordResetEmail', new Map<string, Test | any>([
    ['subject', { test: 'equal', expected: 'Password updated' }],
    ['headers', new Map([
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('passwordReset') }],
      ['X-Template-Name', { test: 'equal', expected: 'passwordReset' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.passwordReset }],
    ])],
    ['html', [
      { test: 'include', expected: decodeUrl(configHref('initiatePasswordResetUrl', 'password-reset-success', 'reset-password', 'email', 'reset_password_confirm=false', 'email_to_hash_with=')) },
      { test: 'include', expected: decodeUrl(configHref('privacyUrl', 'password-reset-success', 'privacy')) },
      { test: 'include', expected: decodeUrl(configHref('supportUrl', 'password-reset-success', 'support')) },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: configUrl('initiatePasswordResetUrl', 'password-reset-success', 'reset-password', 'email', 'reset_password_confirm=false', 'email_to_hash_with=') },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'password-reset-success', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'password-reset-success', 'support')}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],

  ['newDeviceLoginEmail', new Map<string, Test | any>([
    ['subject', { test: 'equal', expected: 'New sign-in to Mock Relier' }],
    ['headers', new Map([
      ['X-Link', { test: 'equal', expected: configUrl('initiatePasswordChangeUrl', 'new-device-signin', 'change-password', 'email') }],
      ['X-SES-MESSAGE-TAGS', { test: 'equal', expected: sesMessageTagsHeaderValue('newDeviceLogin') }],
      ['X-Template-Name', { test: 'equal', expected: 'newDeviceLogin' }],
      ['X-Template-Version', { test: 'equal', expected: TEMPLATE_VERSIONS.newDeviceLogin }],
    ])],
    ['html', [
      { test: 'include', expected: decodeUrl(configHref('accountSettingsUrl', 'new-device-signin', 'manage-account', 'email', 'uid')) },
      { test: 'include', expected: decodeUrl(configHref('initiatePasswordChangeUrl', 'new-device-signin', 'change-password', 'email')) },
      { test: 'include', expected: decodeUrl(configHref('privacyUrl', 'new-device-signin', 'privacy')) },
      { test: 'include', expected: decodeUrl(configHref('supportUrl', 'new-device-signin', 'support')) },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'include', expected: `${MESSAGE.date}` },
      { test: 'include', expected: `${MESSAGE.time}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
    ['text', [
      { test: 'include', expected: `Manage account:\n${configUrl('accountSettingsUrl', 'new-device-signin', 'manage-account', 'email', 'uid')}` },
      { test: 'include', expected: `change your password immediately at ${configUrl('initiatePasswordChangeUrl', 'new-device-signin', 'change-password', 'email')}` },
      { test: 'include', expected: `Mozilla Privacy Policy\n${configUrl('privacyUrl', 'new-device-signin', 'privacy')}` },
      { test: 'include', expected: `For more information, please visit ${configUrl('supportUrl', 'new-device-signin', 'support')}` },
      { test: 'include', expected: `IP address: ${MESSAGE.ip}` },
      { test: 'include', expected: `${MESSAGE.location.city}, ${MESSAGE.location.stateCode}, ${MESSAGE.location.country} (estimated)` },
      { test: 'include', expected: `${MESSAGE.uaBrowser} on ${MESSAGE.uaOS} ${MESSAGE.uaOSVersion}` },
      { test: 'include', expected: `${MESSAGE.date}` },
      { test: 'include', expected: `${MESSAGE.time}` },
      { test: 'notInclude', expected: 'utm_source=email' },
    ]],
  ])],
];

describe('lib/senders/mjml-emails:', () => {
  type LocalizeFn = (message: Record<any, any>) => Promise<Record<any, string>>;
  type SelectEmailServicesFn = (message: Record<any, any>) => Promise<any>;

  let mockLog: Record<any, any>,
    mailer: Record<any, any>,
    localize: LocalizeFn,
    selectEmailServices: SelectEmailServicesFn,
    sendMail: Record<any, any>;

  before(async () => {
    mockLog = mocks.mockLog();
    mailer = await setup(mockLog, config, {
      './oauth_client_info': () => ({
        async fetch() {
          return { name: 'Mock Relier' };
        },
      }),
    });
    // These tests do a lot of ad hoc mocking. Rather than try and clean up
    // after each case, give them carte blanche to do what they want then
    // restore the original methods in the top-level afterEach.
    localize = mailer.localize;
    selectEmailServices = mailer.selectEmailServices;
    sendMail = {
      mailer: mailer.mailer.sendMail,
      emailService: mailer.emailService.sendMail,
    };
  });

  after(() => mailer.stop());

  afterEach(() => {
    Object.values(mockLog).forEach((fn) => {
      if (typeof fn === 'function') {
        fn.resetHistory();
      }
    });
    if (mailer.localize !== localize) {
      mailer.localize = localize;
    }
    if (mailer.selectEmailServices !== selectEmailServices) {
      mailer.selectEmailServices = selectEmailServices;
    }
    if (mailer.mailer.sendMail !== sendMail.mailer) {
      mailer.mailer.sendMail = sendMail.mailer;
    }
    if (mailer.emailService.sendMail !== sendMail.emailService) {
      mailer.emailService.sendMail = sendMail.emailService;
    }
  });

  for (const [type, test, opts = {}] of TESTS) {
    it(`declarative test for ${type}`, async () => {
      mailer.mailer.sendMail = stubSendMail((message: Record<any, any>) => {
        COMMON_TESTS.forEach((assertions, property) => {
          applyAssertions(type, message, property, assertions);
        });
        test.forEach((assertions: any, property: string) => {
          applyAssertions(type, message, property, assertions);
        });
      });
      const { updateTemplateValues }: any = opts;
      const tmplVals = updateTemplateValues
        ? updateTemplateValues(MESSAGE)
        : MESSAGE;
      await mailer[type](tmplVals);
    });
  }
});

function sesMessageTagsHeaderValue(templateName: string, serviceName?: any) {
  return `messageType=fxa-${templateName}, app=fxa, service=${
    serviceName || 'fxa-auth-server'
  }`;
}

function configHref(
  key: string,
  campaign: string,
  content: string,
  ...params: Array<any>
) {
  return `href="${configUrl(key, campaign, content, ...params)}"`;
}

function configUrl(
  key: string,
  campaign: string,
  content: string,
  ...params: Array<any>
) {
  let baseUri: string;
  baseUri = config.smtp[key];

  const out = new URL(baseUri);

  for (const param of params) {
    const [key, value] = param.split('=');
    out.searchParams.append(
      key,
      value || MESSAGE[MESSAGE_PARAMS!.get(key)! as keyof typeof MESSAGE] || ''
    );
  }

  [
    ['utm_medium', 'email'],
    ['utm_campaign', `fx-${campaign}`],
    ['utm_content', `fx-${content}`],
  ].forEach(([key, value]) => out.searchParams.append(key, value));

  const url = out.toString();

  return url;
}

function decodeUrl(encodedUrl: string) {
  return encodedUrl.replace(/&/gm, '&amp;');
}

async function setup(
  log: Record<any, any>,
  config: Record<any, any>,
  mocks: any,
  locale: string = 'en',
  sender: any = null
) {
  const [translator, templates] = await Promise.all([
    require(`${ROOT_DIR}/lib/senders/translator`)([locale], locale),
    require(`${ROOT_DIR}/lib/senders/templates`)(log),
  ]);
  const Mailer = proxyquire(`${ROOT_DIR}/lib/senders/email`, mocks)(
    log,
    config
  );
  return new Mailer(translator, templates, config.smtp, sender);
}

type CallbackFunction = (arg: any) => void;

function stubSendMail(stub: CallbackFunction, status?: any) {
  return (message: any, callback: any) => {
    try {
      stub(message);
      return callback(null, status);
    } catch (err) {
      return callback(err, status);
    }
  };
}

function applyAssertions(
  type: string,
  target: Record<any, any>,
  property: string,
  assertions: any
) {
  target = target[property];

  if (assertions instanceof Map) {
    assertions.forEach((nestedAssertions, nestedProperty) => {
      applyAssertions(type, target, nestedProperty, nestedAssertions);
    });
    return;
  }

  if (!Array.isArray(assertions)) {
    assertions = [assertions];
  }

  describe(`${type} - ${property}`, () => {
    assertions.forEach(({ test, expected }: Test) => {
      it(`${test} - ${expected}`, () => {
        /* @ts-ignore */
        assert[test](target, expected, `${type}: ${property}`);
      });
    });
  });
}
