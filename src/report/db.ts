import type { NewQuestionResult, NewSession, QuestionResultEntity, SessionEntity } from './types';

/** The local report database (the stand-in for Room). Lives only in this browser on this device. */
export interface ReportStore {
  saveSession(session: NewSession, questions: readonly NewQuestionResult[]): Promise<number>;
  sessions(): Promise<SessionEntity[]>;
  questions(): Promise<QuestionResultEntity[]>;
  clearAll(): Promise<void>;
  /** Deletes these games and their answers (one child's history). */
  deleteSessions(ids: readonly number[]): Promise<void>;
}

const DB_NAME = 'ksm-report';
const DB_VERSION = 1;
const SESSIONS = 'sessions';
const QUESTIONS = 'questions';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

class IndexedDbReportStore implements ReportStore {
  private db: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore(SESSIONS, { keyPath: 'id', autoIncrement: true });
        db.createObjectStore(QUESTIONS, { keyPath: 'id', autoIncrement: true }).createIndex('bySession', 'sessionId');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.db;
  }

  async saveSession(session: NewSession, questions: readonly NewQuestionResult[]): Promise<number> {
    const db = await this.open();
    const tx = db.transaction([SESSIONS, QUESTIONS], 'readwrite');
    let sessionId = 0;
    // Add the questions from the session's success callback, inside the same transaction:
    // the session and its questions are saved together or not at all.
    const add = tx.objectStore(SESSIONS).add(session);
    add.onsuccess = () => {
      sessionId = add.result as number;
      const store = tx.objectStore(QUESTIONS);
      for (const q of questions) store.add({ ...q, sessionId });
    };
    await done(tx);
    return sessionId;
  }

  async sessions(): Promise<SessionEntity[]> {
    const db = await this.open();
    return request(db.transaction(SESSIONS).objectStore(SESSIONS).getAll()) as Promise<SessionEntity[]>;
  }

  async questions(): Promise<QuestionResultEntity[]> {
    const db = await this.open();
    return request(db.transaction(QUESTIONS).objectStore(QUESTIONS).getAll()) as Promise<QuestionResultEntity[]>;
  }

  async clearAll(): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([SESSIONS, QUESTIONS], 'readwrite');
    tx.objectStore(SESSIONS).clear();
    tx.objectStore(QUESTIONS).clear();
    await done(tx);
  }

  async deleteSessions(ids: readonly number[]): Promise<void> {
    if (!ids.length) return;
    const db = await this.open();
    const tx = db.transaction([SESSIONS, QUESTIONS], 'readwrite');
    const questions = tx.objectStore(QUESTIONS);
    for (const id of ids) {
      tx.objectStore(SESSIONS).delete(id);
      const keys = questions.index('bySession').getAllKeys(id);
      keys.onsuccess = () => keys.result.forEach((k) => questions.delete(k));
    }
    await done(tx);
  }
}

/** Used when IndexedDB is unavailable (some private-browsing modes): the report lasts for this visit only. */
export class MemoryReportStore implements ReportStore {
  private nextSession = 1;
  private nextQuestion = 1;
  private readonly allSessions: SessionEntity[] = [];
  private readonly allQuestions: QuestionResultEntity[] = [];

  async saveSession(session: NewSession, questions: readonly NewQuestionResult[]): Promise<number> {
    const id = this.nextSession++;
    this.allSessions.push({ ...session, id });
    for (const q of questions) this.allQuestions.push({ ...q, id: this.nextQuestion++, sessionId: id });
    return id;
  }

  async sessions(): Promise<SessionEntity[]> {
    return this.allSessions.slice();
  }

  async questions(): Promise<QuestionResultEntity[]> {
    return this.allQuestions.slice();
  }

  async clearAll(): Promise<void> {
    this.allSessions.length = 0;
    this.allQuestions.length = 0;
  }

  async deleteSessions(ids: readonly number[]): Promise<void> {
    const gone = new Set(ids);
    const keepSessions = this.allSessions.filter((s) => !gone.has(s.id));
    const keepQuestions = this.allQuestions.filter((q) => !gone.has(q.sessionId));
    this.allSessions.splice(0, this.allSessions.length, ...keepSessions);
    this.allQuestions.splice(0, this.allQuestions.length, ...keepQuestions);
  }
}

class FallbackReportStore implements ReportStore {
  private store: ReportStore = typeof indexedDB !== 'undefined' ? new IndexedDbReportStore() : new MemoryReportStore();

  private async run<T>(op: (s: ReportStore) => Promise<T>): Promise<T> {
    try {
      return await op(this.store);
    } catch (e) {
      if (this.store instanceof MemoryReportStore) throw e;
      console.warn('[report] IndexedDB unavailable, keeping results in memory for this visit', e);
      this.store = new MemoryReportStore();
      return op(this.store);
    }
  }

  saveSession(session: NewSession, questions: readonly NewQuestionResult[]) {
    return this.run((s) => s.saveSession(session, questions));
  }

  sessions() {
    return this.run((s) => s.sessions());
  }

  questions() {
    return this.run((s) => s.questions());
  }

  clearAll() {
    return this.run((s) => s.clearAll());
  }

  deleteSessions(ids: readonly number[]) {
    return this.run((s) => s.deleteSessions(ids));
  }
}

export const reportStore: ReportStore = new FallbackReportStore();
