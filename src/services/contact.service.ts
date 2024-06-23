import {Contact, LinkPrecedence, PrismaClient} from '@prisma/client';
import {compact, partition, sortBy, uniq, uniqBy} from 'lodash';

export class ContactService {
  constructor(private prisma: PrismaClient) {}

  async identify(email?: string, phoneNumber?: string) {
    const contacts = await this.getContacts(email, phoneNumber);

    if (contacts.length === 0) {
      return this.createNewPrimaryContact(email, phoneNumber);
    }

    const [primaryContacts, secondaryContacts] = partition(
      contacts,
      item => item.linkPrecedence === LinkPrecedence.PRIMARY,
    );
    const primaryContact = this.getPrimaryContact(primaryContacts);

    if (primaryContacts.length > 1) {
      await this.ensureSinglePrimary(
        primaryContact,
        primaryContacts,
        secondaryContacts,
      );
    }
    const existingSecondary = contacts.find(
      c => c.linkPrecedence === LinkPrecedence.SECONDARY,
    );
    if (!existingSecondary) {
      const newSecondary = await this.createSecondaryContact(
        primaryContact.id,
        email,
        phoneNumber,
      );
      secondaryContacts.push(newSecondary);
    }

    return this.buildContactResponse(
      primaryContact,
      contacts,
      secondaryContacts,
      email,
      phoneNumber,
    );
  }

  private async getContacts(
    email?: string,
    phoneNumber?: string,
  ): Promise<Contact[]> {
    const contacts = await this.prisma.contact.findMany({
      where: {
        OR: [email ? {email} : {}, phoneNumber ? {phoneNumber} : {}],
      },
    });

    if (![email, phoneNumber].every(Boolean)) {
      const additionalContacts = await this.prisma.contact.findMany({
        where: {
          OR: [
            {
              phoneNumber: {
                in: compact(contacts.map(c => c.phoneNumber)),
              },
            },
            {
              email: {
                in: compact(contacts.map(c => c.email)),
              },
            },
          ],
        },
      });

      return uniqBy([...contacts, ...additionalContacts], 'id');
    }

    return contacts;
  }

  private async createNewPrimaryContact(email?: string, phoneNumber?: string) {
    const newContact = await this.prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkPrecedence: LinkPrecedence.PRIMARY,
      },
    });

    return {
      contact: {
        primaryContactId: newContact.id,
        emails: [newContact.email],
        phoneNumbers: [newContact.phoneNumber],
        secondaryContactIds: [],
      },
    };
  }

  private getPrimaryContact(primaryContacts: Contact[]): Contact {
    const [primaryContact] = sortBy(primaryContacts, 'createdAt');
    return primaryContact;
  }

  private async demoteToSecondary(
    contact: Contact,
    linkedId: number,
  ): Promise<Contact> {
    await this.prisma.contact.update({
      where: {id: contact.id},
      data: {linkedId, linkPrecedence: LinkPrecedence.SECONDARY},
    });
    return contact;
  }

  private async createSecondaryContact(
    primaryContactId: number,
    email?: string,
    phoneNumber?: string,
  ): Promise<Contact> {
    return this.prisma.contact.create({
      data: {
        email,
        phoneNumber,
        linkedId: primaryContactId,
        linkPrecedence: LinkPrecedence.SECONDARY,
      },
    });
  }

  private async ensureSinglePrimary(
    primaryContact: Contact,
    primaryContacts: Contact[],
    secondaryContacts: Contact[],
  ) {
    for (const contact of primaryContacts) {
      if (
        contact.linkPrecedence === LinkPrecedence.PRIMARY &&
        contact.id !== primaryContact.id
      ) {
        const demotedContact = await this.demoteToSecondary(
          contact,
          primaryContact.id,
        );
        secondaryContacts.push(demotedContact);
      }
    }
  }

  private buildContactResponse(
    primaryContact: Contact,
    contacts: Contact[],
    secondaryContacts: Contact[],
    email?: string,
    phoneNumber?: string,
  ) {
    const emails = uniq(
      compact([primaryContact.email, ...contacts.map(c => c.email), email]),
    );
    const phoneNumbers = uniq(
      compact([
        primaryContact.phoneNumber,
        ...contacts.map(c => c.phoneNumber),
        phoneNumber,
      ]),
    );
    const secondaryContactIds = secondaryContacts.map(c => c.id);

    return {
      contact: {
        primaryContactId: primaryContact.id,
        emails,
        phoneNumbers,
        secondaryContactIds,
      },
    };
  }
}
