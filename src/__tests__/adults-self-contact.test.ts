import fs from "fs";
import path from "path";

// The account holder's own tracked profile, on the family dashboard.
//
// A contact whose relationship_type is "self" is the person reading the
// screen. Everything that offers to invite or remind "them" has to behave
// differently, because the one thing WhatsApp cannot do is deliver a
// message from someone to their own number — which is exactly what the
// family invite flow generated: "Hi Sonam, tap this link and send the
// prefilled message", shown to Sonam.

const src = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf-8");
/** Line comments first: a "//" line containing "/*" would otherwise open a
 * block comment that swallows real code and makes negatives pass wrongly. */
const code = (p: string) => src(p).replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

const CARD = "components/adults/dashboard/FamilyHealthCard.tsx";
const EDIT = "components/adults/dashboard/EditContactModal.tsx";
const ACTIONS = "app/(adults)/adults/dashboard/actions.ts";

describe("the self card never offers an invite", () => {
  it("branches on relationship_type before rendering either invite path", () => {
    const card = code(CARD);
    expect(card).toMatch(/const isSelf = contact\.relationshipType === "self";/);
    // Both the "not connected" and "gone quiet" blocks must be guarded.
    expect(card.match(/\{isSelf \? \(/g)?.length).toBe(2);
  });

  it("sends the account holder to Tistra Health, not to themselves", () => {
    const card = code(CARD);
    // The self paths point at the Tistra number. An InviteCard (which
    // builds a JOIN link for someone else to send) must not appear inside
    // a self branch.
    const selfBlocks = [...card.matchAll(/\{isSelf \? \(([\s\S]*?)\) : \(/g)].map((m) => m[1]);
    expect(selfBlocks).toHaveLength(2);
    for (const block of selfBlocks) {
      expect(block).toMatch(/wa\.me\/\$\{tistraWhatsAppNumber\}/);
      expect(block).not.toMatch(/InviteCard/);
      expect(block).not.toMatch(/getOrCreateFamilyInvite/);
    }
  });

  it("opens the chat with the message already typed", () => {
    // A bare wa.me link opens an empty conversation. Sending something is
    // the only thing that reopens the 24h window, so leaving the user to
    // compose it is the difference between the button working and not.
    const card = code(CARD);
    expect(card.match(/encodeURIComponent\(SELF_WHATSAPP_GREETING\)/g)?.length).toBe(2);
  });

  it("tells the user what to do, in Tistra Health's name", () => {
    expect(code(CARD)).toMatch(/title="Message Tistra Health to get started"/);
  });
});

describe("the mobile app matches", () => {
  // The app has its own React Native card, so a fix to the web dashboard
  // does not reach the phone. Both read the same relationship_type flag;
  // what has to stay in step is what they DO with it.
  const MOBILE = "../apps/mobile/src/components/family-health-card.tsx";
  const mobile = () =>
    fs.readFileSync(path.join(__dirname, "..", MOBILE), "utf-8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

  it("derives self from the same flag", () => {
    expect(mobile()).toMatch(/relationshipType === 'self'/);
  });

  it("opens Tistra Health with the message typed, not an empty chat", () => {
    const m = mobile();
    expect(m).toMatch(/encodeURIComponent\(SELF_WHATSAPP_GREETING\)/);
    // The bare link is what left the user in a blank conversation.
    expect(m).not.toMatch(/`https:\/\/wa\.me\/\$\{invite\.tistraWhatsAppNumber\}`/);
  });

  it("never opens a share sheet for the account holder", () => {
    // Share.share is the flow that produced "Hi Sonam, tap this link and
    // send the prefilled message" — shown to Sonam.
    const m = mobile();
    const selfBranch = m.slice(m.indexOf("if (invite.status === 'stale' && invite.isSelf)"), m.indexOf("setSendingInvite(true)"));
    expect(selfBranch).not.toMatch(/Share\.share/);
    expect(selfBranch).toMatch(/Linking\.openURL/);
  });

  it("uses the same greeting text as the web card", () => {
    const web = fs.readFileSync(path.join(__dirname, "..", CARD), "utf-8");
    const grab = (t: string) => t.match(/const SELF_WHATSAPP_GREETING = "(.*?)";/)?.[1];
    expect(grab(mobile())).toBe(grab(web));
    expect(grab(web)).toBeTruthy();
  });
});

describe("a contact can be corrected to self after the fact", () => {
  it("offers Myself regardless of what the contact is today", () => {
    // Previously gated on the contact ALREADY being self, so one created
    // without it could never be fixed — the dashboard kept offering to
    // send them an invite link to their own number, with no way out.
    const edit = code(EDIT);
    expect(edit).toMatch(/<option value="self">Myself<\/option>/);
    expect(edit).not.toMatch(/contact\.relationshipType === "self" && <option value="self">/);
  });

  it("actually sends the type, not just the free-text relationship", () => {
    expect(code(EDIT)).toMatch(/relationshipType: relationship === "self" \? "self" : "family_caregiver"/);
  });

  it("persists it", () => {
    const actions = code(ACTIONS);
    expect(actions).toMatch(/relationshipType\?: "self" \| "family_caregiver";/);
    expect(actions).toMatch(/\.\.\.\(formData\.relationshipType \? \{ relationship_type: formData\.relationshipType \} : \{\}\)/);
  });

  it("keeps self to one per workspace, checked on the server", () => {
    // The modal only knows the contact it is editing, so it cannot see a
    // clash; two self contacts would make the dashboard's branching
    // ambiguous.
    const actions = code(ACTIONS);
    expect(actions).toMatch(/\.eq\("relationship_type", "self"\)/);
    expect(actions).toMatch(/is already set as you/);
    expect(actions).toMatch(/\.neq\("id", contactId\)/);
  });

  it("clears the free-text relationship when marking self", () => {
    // "self" lives in relationship_type; a leftover "parent" would show
    // the wrong label next to the user's own name.
    expect(code(ACTIONS)).toMatch(/relationship: formData\.relationshipType === "self" \? null : formData\.relationship \|\| null/);
  });
});
