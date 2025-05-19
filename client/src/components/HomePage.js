import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth0 } from '@auth0/auth0-react';
import StorylineEditor from './StorylineEditor';
import ImageManager from './ImageManager';
import UserManagement from './UserManagement';
import UserProfile from './UserProfile';
import PublicUserProfile from './PublicUserProfile';
import EducatorPanel from './EducatorPanel';
import ProfileSearch from './ProfileSearch';
import Preferences from './Preferences';
import TopHeader from './TopHeader';
import MainNavTabs from './MainNavTabs';
import { useLocation, useNavigate } from 'react-router-dom';
import QuestionBankEditor from './QuestionBankEditor';
import QuestionPractice from './QuestionPractice';
import LectureManager from './LectureManager';
import LectureEditor from './LectureEditor';
import StudentLectureList from './StudentLectureList';
import JournalStudent from './JournalStudent';
import JournalManager from './JournalManager';
import QuestionReport from './QuestionReport';
import StudentPracticeReports from './StudentPracticeReports';
import QuestionStatsByQuestion from './QuestionStatsByQuestion';
import QuestionStatsByTag from './QuestionStatsByTag';
import ArticleManager from './ArticleManager';
import StudentArticleList from './StudentArticleList';
import ArticleEditor from './ArticleEditor';
import SendSystemMessage from './SendSystemMessage';
import '../styles/mobile-layout.css';
import '../styles/dropdown.css';
import '../styles/mobile-question-bank.css';

const HomePage = () => {
  const { user } = useAuth0();
  const userSub = user?.sub || localStorage.getItem('userSub');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [viewUserId, setViewUserId] = useState(null);
  const [lectureId, setLectureId] = useState(null);
  const [initialPromptId, setInitialPromptId] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isEducator, setIsEducator] = useState(false);
  const [articleId, setArticleId] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    // Set page title when component mounts
    document.title = "Viral Valor";
    
    // Priority 1: query param ?tab=
    const params = new URLSearchParams(location.search);
    const tabParam = params.get('tab');
    const uidParam = params.get('uid');
    const lecParam = params.get('lecture');
    const promptParam = params.get('prompt');
    const artParam = params.get('article');

    if (tabParam) {
      setActiveTab(tabParam);
    } else if (location.hash) {
      // Fallback hash support (legacy)
      const tab = location.hash.replace('#', '');
      if (tab) setActiveTab(tab);
    } else {
      setActiveTab('dashboard');
    }

    if (uidParam) {
      setViewUserId(uidParam);
    }
    
    if (lecParam) {
      setLectureId(lecParam);
    }

    if (promptParam) {
      setInitialPromptId(promptParam);
    }

    if (artParam) setArticleId(artParam);

    if (!userSub) return;
    axios.get('am-admin', { headers: { 'x-user-sub': userSub } })
      .then(({ data }) => setIsAdmin(!!data.isAdmin))
      .catch(() => setIsAdmin(false));

    axios.get('am-educator', { headers: { 'x-user-sub': userSub } })
      .then(({ data }) => setIsEducator(!!data.isEducator))
      .catch(() => setIsEducator(false));
      
    // Handle responsive layout
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [location, userSub]);

  // Function to handle viewing a user profile
  const handleViewUserProfile = (userId) => {
    navigate({ pathname: '/', search: `?tab=viewprofile&uid=${userId}` });
  };

  // Function to handle editing a lecture
  const handleEditLecture = (id) => {
    navigate({ pathname: '/', search: `?tab=lecture-edit&lecture=${id || 'new'}` });
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'storyline':
        return <StorylineEditor />;
      case 'images':
        return isAdmin ? <ImageManager /> : (
          <div style={{ padding: '1rem' }}>
            <h3>Access Denied</h3>
            <p>You do not have permission to view this section.</p>
          </div>
        );
      case 'users':
        return isAdmin ? <UserManagement onViewProfile={handleViewUserProfile} /> : (
          <div style={{ padding: '1rem' }}>
            <h3>Access Denied</h3>
            <p>You do not have permission to view this section.</p>
          </div>
        );
      case 'profile':
        return <UserProfile />;
      case 'viewprofile':
        return viewUserId ? <PublicUserProfile userId={viewUserId} onBack={() => setActiveTab('users')} /> : null;
      case 'playersearch':
        return <ProfileSearch onViewProfile={handleViewUserProfile} />;
      case 'statistics':
        return <QuestionReport />;
      case 'studentstats':
        return isAdmin ? <StudentPracticeReports /> : (
          <div style={{ padding: '1rem' }}>
            <h3>Access Denied</h3>
            <p>You do not have permission to view this section.</p>
          </div>
        );
      case 'questionstats':
        return isAdmin ? <QuestionStatsByQuestion /> : (
          <div style={{ padding: '1rem' }}>
            <h3>Access Denied</h3>
            <p>You do not have permission to view this section.</p>
          </div>
        );
      case 'tagstats':
        return isAdmin ? <QuestionStatsByTag /> : (
          <div style={{ padding: '1rem' }}>
            <h3>Access Denied</h3>
            <p>You do not have permission to view this section.</p>
          </div>
        );
      case 'sendsysmsg':
        return isAdmin ? <SendSystemMessage /> : (
          <div style={{ padding: '1rem' }}>
            <h3>Access Denied</h3>
            <p>You do not have permission to view this section.</p>
          </div>
        );
      case 'multiplayer':
        return (isAdmin || isEducator) ? <EducatorPanel embedded={true} /> : (
          <div style={{ padding: '1rem' }}>
            <h3>Access Denied</h3>
            <p>You do not have permission to view this section.</p>
          </div>
        );
      case 'dashboard':
        return (
          <div className="fullscreen-homepage-content">
            <section className="welcome-banner">
              <img src="/images/splash.png" alt="Viral Valor" className="splash-image" />
            </section>
          </div>
        );
      case 'preferences':
        return <Preferences />;
      case 'questions':
        return isAdmin ? <QuestionBankEditor /> : (
          <div style={{ padding: '1rem' }}>
            <h3>Access Denied</h3>
            <p>You do not have permission to view this section.</p>
          </div>
        );
      case 'practice':
        return <QuestionPractice />;
      case 'lectures':
        return <LectureManager onEditLecture={handleEditLecture} />;
      case 'lecture-edit':
        return <LectureEditor lectureId={lectureId} onBack={() => navigate({ pathname: '/', search: '?tab=lectures' })} />;
      case 'mylectures':
        return <StudentLectureList />;
      case 'journals':
        return <JournalStudent initialPromptId={initialPromptId} />;
      case 'journalprompts':
        return isAdmin ? <JournalManager /> : (
          <div style={{ padding: '1rem' }}>
            <h3>Access Denied</h3>
            <p>You do not have permission to view this section.</p>
          </div>
        );
      case 'articles':
        return (isAdmin || isEducator) ? <ArticleManager onEditArticle={(id)=>navigate({ pathname: '/', search: `?tab=article-edit&article=${id}` })} /> : (
          <div style={{ padding: '1rem' }}>
            <h3>Access Denied</h3>
            <p>You do not have permission to view this section.</p>
          </div>
        );
      case 'myarticles':
        return <StudentArticleList />;
      case 'article-edit':
        return <ArticleEditor onBack={()=>navigate({ pathname: '/', search: '?tab=articles' })} />;
      default:
        return null;
    }
  };

  return (
    <div className={`homepage ${isMobile ? 'mobile-view' : ''}`}>
      <TopHeader title="Viral Valor">
        <MainNavTabs activeTab={activeTab} />
      </TopHeader>
      
      <main className={`${activeTab === 'dashboard' ? 'fullwidth-content' : 'main-content'} ${['statistics','studentstats','questionstats','tagstats'].includes(activeTab) ? 'report-page' : ''}`}>
        {renderTabContent()}
      </main>
    </div>
  );
};

export default HomePage;