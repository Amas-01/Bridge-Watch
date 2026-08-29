import { useMemo, useState } from "react";
import {
  faqItems,
  helpArticles,
  helpCategories,
  type HelpCategory,
} from "../content/helpContent";
import { Tabs, TabList, Tab, TabPanel } from "../components/Tabs";

type RatingMap = Record<string, number>;

const STORAGE_KEY = "bridge-watch:help:ratings:v1";

function loadRatings(): RatingMap {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as RatingMap) : {};
  } catch {
    return {};
  }
}

function saveRatings(ratings: RatingMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ratings));
}

export default function Help() {
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<HelpCategory | "all">("all");
  const [selectedArticleId, setSelectedArticleId] = useState(helpArticles[0]?.id ?? "");
  const [feedback, setFeedback] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [ratings, setRatings] = useState<RatingMap>(loadRatings);

  const filteredArticles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return helpArticles.filter((article) => {
      const categoryMatches = selectedCategory === "all" || article.category === selectedCategory;
      if (!categoryMatches) return false;
      if (!normalized) return true;

      return (
        article.title.toLowerCase().includes(normalized) ||
        article.summary.toLowerCase().includes(normalized) ||
        article.content.toLowerCase().includes(normalized)
      );
    });
  }, [query, selectedCategory]);

  const selectedArticle =
    filteredArticles.find((article) => article.id === selectedArticleId) ?? filteredArticles[0] ?? null;

  const relatedArticles = useMemo(() => {
    if (!selectedArticle) return [];
    return selectedArticle.related
      .map((id) => helpArticles.find((article) => article.id === id))
      .filter((article): article is (typeof helpArticles)[number] => Boolean(article));
  }, [selectedArticle]);

  const filteredFaq = useMemo(() => {
    if (selectedCategory === "all") return faqItems;
    return faqItems.filter((item) => item.category === selectedCategory);
  }, [selectedCategory]);

  function setArticleRating(articleId: string, rating: number): void {
    const next = { ...ratings, [articleId]: rating };
    setRatings(next);
    saveRatings(next);
  }

  function submitFeedback(): void {
    if (!feedback.trim()) return;
    setFeedbackSent(true);
    setFeedback("");
    setContactEmail("");
  }

  return (
    <div className="space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold text-stellar-text-primary">Help Center</h1>
        <p className="text-stellar-text-secondary max-w-3xl">
          Search documentation, browse FAQs, and find contextual guidance for dashboard operations,
          integrations, and incident response.
        </p>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <aside className="lg:col-span-1 space-y-4">
          <div className="rounded-lg border border-stellar-border bg-stellar-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stellar-text-secondary" id="help-categories-label">Categories</h2>
            <Tabs
              activeTab={selectedCategory}
              onTabChange={(id) => setSelectedCategory(id as HelpCategory | "all")}
              orientation="vertical"
            >
              <TabList
                aria-labelledby="help-categories-label"
                className="mt-3 flex flex-col gap-2"
              >
                <Tab
                  id="all"
                  activeClassName="bg-stellar-blue text-white border-transparent"
                  inactiveClassName="text-stellar-text-secondary hover:bg-stellar-dark hover:text-stellar-text-primary border-transparent"
                  className="rounded-md px-3 py-2 text-left text-sm"
                >
                  All topics
                </Tab>
                {helpCategories.map((category) => (
                  <Tab
                    key={category.id}
                    id={category.id}
                    activeClassName="bg-stellar-blue text-white border-transparent"
                    inactiveClassName="text-stellar-text-secondary hover:bg-stellar-dark hover:text-stellar-text-primary border-transparent"
                    className="rounded-md px-3 py-2 text-left text-sm"
                  >
                    <div className="font-medium">{category.label}</div>
                    <div className="text-xs opacity-80 mt-1">{category.description}</div>
                  </Tab>
                ))}
              </TabList>
              {/* Panels are rendered outside the sidebar — keepMounted so state is preserved */}
              <TabPanel id="all" keepMounted />
              {helpCategories.map((category) => (
                <TabPanel key={category.id} id={category.id} keepMounted />
              ))}
            </Tabs>
          </div>

          <div className="rounded-lg border border-stellar-border bg-stellar-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stellar-text-secondary">Getting Started</h2>
            <ol className="mt-3 space-y-2 text-sm text-stellar-text-secondary list-decimal list-inside">
              <li>Open Dashboard and verify live data connections.</li>
              <li>Configure notification thresholds in Settings.</li>
              <li>Enable API integrations and webhook callbacks.</li>
            </ol>
          </div>

          <div className="rounded-lg border border-stellar-border bg-stellar-card p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stellar-text-secondary">Video Tutorials</h2>
            <div className="mt-3 space-y-2 text-sm">
              {helpArticles
                .filter((article) => Boolean(article.videoUrl))
                .map((article) => (
                  <a
                    key={article.id}
                    href={article.videoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-stellar-blue hover:underline"
                  >
                    {article.title}
                  </a>
                ))}
            </div>
          </div>
        </aside>

        <div className="lg:col-span-3 space-y-6">
          <section className="rounded-lg border border-stellar-border bg-stellar-card p-4">
            <label htmlFor="help-search" className="text-sm font-medium text-stellar-text-secondary">
              Search documentation
            </label>
            <input
              id="help-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by keyword, topic, or workflow"
              className="mt-2 w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
            />

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredArticles.map((article) => (
                <button
                  key={article.id}
                  type="button"
                  onClick={() => setSelectedArticleId(article.id)}
                  className={`rounded-md border p-3 text-left transition-colors ${
                    selectedArticle?.id === article.id
                      ? "border-stellar-blue bg-stellar-blue/10"
                      : "border-stellar-border hover:border-stellar-blue/50"
                  }`}
                >
                  <div className="text-sm font-medium text-stellar-text-primary">{article.title}</div>
                  <p className="mt-1 text-xs text-stellar-text-secondary">{article.summary}</p>
                </button>
              ))}
            </div>
          </section>

          {selectedArticle && (
            <article className="rounded-lg border border-stellar-border bg-stellar-card p-6 space-y-4">
              <header className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-stellar-text-secondary">Documentation Viewer</p>
                <h2 className="text-2xl font-semibold text-stellar-text-primary">{selectedArticle.title}</h2>
                <p className="text-sm text-stellar-text-secondary">{selectedArticle.summary}</p>
              </header>

              <p className="text-stellar-text-secondary">{selectedArticle.content}</p>

              <div className="border-t border-stellar-border pt-4">
                <p className="text-sm font-medium text-stellar-text-primary">Rate this article</p>
                <div className="mt-2 flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setArticleRating(selectedArticle.id, value)}
                      className={`h-8 w-8 rounded-full border text-sm transition-colors ${
                        (ratings[selectedArticle.id] ?? 0) >= value
                          ? "border-stellar-blue bg-stellar-blue text-white"
                          : "border-stellar-border text-stellar-text-secondary hover:border-stellar-blue"
                      }`}
                      aria-label={`Rate ${value} star`}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>

              {relatedArticles.length > 0 && (
                <div className="border-t border-stellar-border pt-4">
                  <p className="text-sm font-medium text-stellar-text-primary">Related articles</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {relatedArticles.map((article) => (
                      <button
                        key={article.id}
                        type="button"
                        onClick={() => setSelectedArticleId(article.id)}
                        className="rounded-md border border-stellar-border px-3 py-1 text-xs text-stellar-text-secondary hover:border-stellar-blue hover:text-stellar-text-primary"
                      >
                        {article.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </article>
          )}

          <section className="rounded-lg border border-stellar-border bg-stellar-card p-6">
            <h2 className="text-lg font-semibold text-stellar-text-primary">FAQ</h2>
            <div className="mt-4 space-y-3">
              {filteredFaq.map((item) => (
                <details key={item.id} className="rounded-md border border-stellar-border p-3">
                  <summary className="cursor-pointer text-sm font-medium text-stellar-text-primary">
                    {item.question}
                  </summary>
                  <p className="mt-2 text-sm text-stellar-text-secondary">{item.answer}</p>
                </details>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-stellar-border bg-stellar-card p-6 space-y-4">
            <h2 className="text-lg font-semibold text-stellar-text-primary">Contact Support and Feedback</h2>
            <p className="text-sm text-stellar-text-secondary">
              Share what is missing or confusing in the docs. The team reviews feedback during each sprint.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
                placeholder="Email (optional)"
                className="rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
              />
              <a
                href="mailto:support@bridgewatch.io"
                className="rounded-md border border-stellar-border px-3 py-2 text-center text-sm text-stellar-blue hover:bg-stellar-dark"
              >
                Contact support directly
              </a>
            </div>
            <textarea
              value={feedback}
              onChange={(event) => {
                setFeedback(event.target.value);
                setFeedbackSent(false);
              }}
              placeholder="Tell us what should be improved"
              rows={4}
              className="w-full rounded-md border border-stellar-border bg-stellar-dark px-3 py-2 text-stellar-text-primary focus:outline-none focus:ring-2 focus:ring-stellar-blue"
            />
            <button
              type="button"
              onClick={submitFeedback}
              className="rounded-md bg-stellar-blue px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              Send feedback
            </button>
            {feedbackSent && <p className="text-sm text-green-400">Feedback received. Thank you.</p>}
          </section>
        </div>
      </section>
    </div>
  );
}
