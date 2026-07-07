import React, { useEffect, useState } from 'react';
import { Entry } from '../types/entry';
import { entriesApi } from '../api/entriesApi';
import { categoriesApi } from '../api/categoriesApi';
import { Category } from '../types/category';
import { EntryCard } from '../components/EntryCard';
import { useLanguageTheme } from '../context/LanguageThemeContext';
import { 
  Building2, 
  Cpu, 
  Lightbulb, 
  Award,
  ArrowRight,
  BookOpen,
  ArrowDownCircle,
  Database
} from 'lucide-react';

interface PublicHomeProps {
  onNavigate: (view: string, details?: any) => void;
  isLoggedIn: boolean;
}

export const PublicHome: React.FC<PublicHomeProps> = ({ onNavigate, isLoggedIn }) => {
  const { lang, t } = useLanguageTheme();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [fetchedEntries, fetchedCategories] = await Promise.all([
          entriesApi.getEntries({ visibility: 'public' }), // explicitly restrict to public on home
          categoriesApi.getCategories()
        ]);
        setEntries(fetchedEntries.slice(0, 3)); // show top 3 latest
        setCategories(fetchedCategories);
      } catch (e) {
        console.error('Failed to get public home data', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const categoryMap = categories.reduce<Record<number, string>>((acc, cat) => {
    acc[cat.id] = cat.name;
    return acc;
  }, {});

  const statCards = [
    {
      id: 'product',
      title: t('statProductTitle'),
      desc: t('statProductDesc'),
      icon: Building2,
      color: 'bg-brand-indigo/10 dark:bg-brand-yellow/10 text-brand-indigo dark:text-brand-yellow border-brand-indigo/20 dark:border-brand-yellow/30',
      viewOverride: 'entries',
      filter: { entry_type: 'product' }
    },
    {
      id: 'tech',
      title: t('statTechTitle'),
      desc: t('statTechDesc'),
      icon: Cpu,
      color: 'bg-brand-coral/10 text-brand-coral border-brand-coral/20',
      viewOverride: 'entries',
      filter: { entry_type: 'tech' }
    },
    {
      id: 'patent',
      title: t('statPatentTitle'),
      desc: t('statPatentDesc'),
      icon: Award,
      color: 'bg-brand-yellow/10 text-brand-charcoal dark:text-brand-yellow border-brand-yellow/40',
      viewOverride: 'entries',
      filter: { entry_type: 'patent' }
    },
    {
      id: 'data',
      title: t('statDataTitle'),
      desc: t('statDataDesc'),
      icon: Database,
      color: 'bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-100 dark:border-sky-500/20',
      viewOverride: 'entries',
      filter: { entry_type: 'data_item' }
    }
  ];

  const handleCardClick = (card: typeof statCards[0]) => {
    if (card.id === 'data' && !isLoggedIn) {
      onNavigate('login');
    } else {
      onNavigate(card.viewOverride, card.filter);
    }
  };

  return (
    <div className="space-y-12">
      {/* 1. Header/Hero Area with brand accent border */}
      <section className="bg-brand-indigo text-white border-2 border-brand-yellow rounded-2xl py-12 px-6 sm:px-12 overflow-hidden relative shadow-md transition-colors">
        <div className="absolute inset-x-0 bottom-0 top-0 opacity-10 bg-[radial-gradient(#F2D760_1px,transparent_1px)] [background-size:16px_16px]" />
        
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 rounded-full text-xs font-bold text-brand-yellow font-mono tracking-wider border border-white/5 select-none uppercase">
            Platform MVP Release
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white font-sans">
            {t('heroSubtitle')}
          </h1>
          <p className="text-sm sm:text-base text-gray-200 leading-relaxed max-w-2xl">
            {t('heroDesc')}
          </p>
          
          <div className="pt-4 flex flex-wrap gap-3.5">
            <button
              onClick={() => onNavigate('entries')}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-yellow hover:bg-brand-yellow/90 text-brand-indigo font-extrabold rounded-lg text-xs sm:text-sm transition-all cursor-pointer shadow-xs"
              id="hero-btn-explore"
            >
              <BookOpen className="w-4 h-4" />
              <span>{t('btnExplore')}</span>
            </button>

            {!isLoggedIn && (
              <button
                onClick={() => onNavigate('login')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold rounded-lg text-xs sm:text-sm transition-all cursor-pointer"
                id="hero-btn-login"
              >
                <span>{t('btnLogin')}</span>
                <ArrowRight className="w-4 h-4 text-brand-yellow" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 2. Core Entry Grid Section */}
      <section className="space-y-4">
        <div className="border-b border-theme-border pb-3 flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-extrabold text-theme-text font-sans tracking-tight">
            {t('coreBusinessHeader')}
          </h2>
          <span className="text-[10px] text-theme-muted font-mono uppercase tracking-wider">MVP SCENARIOS</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="home-stat-cards">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.id}
                onClick={() => handleCardClick(card)}
                className="bg-theme-card border border-theme-border rounded-xl p-5 hover:border-brand-yellow hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between"
                id={`home-stat-card-${card.id}`}
              >
                <div>
                  <div className={`w-10 h-10 ${card.color} border rounded-lg flex items-center justify-center mb-4`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-theme-text mb-1.5 font-sans tracking-tight">
                    {card.title}
                  </h3>
                  <p className="text-xs text-theme-muted leading-relaxed line-clamp-3">
                    {card.desc}
                  </p>
                </div>
                
                <div className="mt-4 pt-3.5 border-t border-theme-border flex items-center gap-1 text-[11px] font-bold text-brand-indigo dark:text-brand-yellow font-sans">
                  <span>{t('viewSection')}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Highlighted Public Wiki Entries */}
      <section className="space-y-5">
        <div className="flex items-center justify-between border-b border-theme-border pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-theme-text font-sans tracking-tight">
              {t('latestPublicEntries')}
            </h2>
            <span className="px-2 py-0.5 bg-brand-coral/10 text-brand-coral border border-brand-coral/20 rounded-xs text-[10px] font-bold">
              {t('noAuthNeeded')}
            </span>
          </div>
          <button 
            onClick={() => onNavigate('entries', { visibility: 'public' })} 
            className="flex items-center gap-1 text-xs text-theme-muted hover:text-theme-text transition-colors cursor-pointer"
          >
            <span>{t('viewMorePublic')}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[1, 2, 3].map((num) => (
              <div key={num} className="bg-theme-card border border-theme-border rounded-xl h-44 animate-pulse animate-duration-1000" />
            ))}
          </div>
        ) : entries.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5" id="home-featured-entries">
            {entries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                categoryName={categoryMap[entry.category_id || 0] || 'Uncategorized'}
                onSelect={(id) => onNavigate('detail', { id })}
                isLoggedIn={isLoggedIn}
              />
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-theme-muted border border-dashed border-theme-border rounded-lg bg-theme-card text-xs">
            {lang === 'zh' ? '暂无匹配的公开 Wiki 条目' : 'No Public Wiki Articles Found'}
          </div>
        )}
      </section>

      {/* 4. Scenario Explanation block for coworkers */}
      <section className="bg-theme-card rounded-xl p-6 border-2 border-dashed border-brand-yellow/30">
        <h3 className="text-sm font-bold text-theme-text mb-2 flex items-center gap-2">
          <ArrowDownCircle className="w-4 h-4 text-brand-coral animate-bounce" />
          {t('mvpGuideTitle')}
        </h3>
        <p className="text-xs text-theme-muted leading-relaxed mb-4">
          {t('mvpGuideDesc')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono text-theme-text">
          <div className="bg-theme-bg p-3.5 border border-theme-border rounded-lg">
            <strong className="text-brand-indigo dark:text-brand-yellow font-bold">{t('scenario1Title')}</strong><br />
            <span className="text-theme-muted text-[11px] block mt-1">{t('scenario1Desc')}</span>
          </div>
          <div className="bg-theme-bg p-3.5 border border-theme-border rounded-lg">
            <strong className="text-brand-indigo dark:text-brand-yellow font-bold">{t('scenario2Title')}</strong><br />
            <span className="text-theme-muted text-[11px] block mt-1">{t('scenario2Desc')}</span>
          </div>
          <div className="bg-theme-bg p-3.5 border border-theme-border rounded-lg">
            <strong className="text-brand-indigo dark:text-brand-yellow font-bold">{t('scenario3Title')}</strong><br />
            <span className="text-theme-muted text-[11px] block mt-1">{t('scenario3Desc')}</span>
          </div>
        </div>
      </section>
    </div>
  );
};
