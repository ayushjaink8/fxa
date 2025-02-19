/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Meta } from '@storybook/html';
import { storyWithProps } from '../../storybook-email';

export default {
  title: 'Emails/verificationReminderSecond',
} as Meta;

const createStory = storyWithProps(
  'verificationReminderSecond',
  'Reminder sent 5 days after an ignored verification.',
  {
    link: 'http://localhost:3030/verify_email',
  }
);

export const verificationReminderSecond = createStory();
