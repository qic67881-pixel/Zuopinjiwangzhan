import { useState, useEffect, ChangeEvent, FormEvent, Component, ReactNode, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Github, Linkedin, Twitter, Mail, ExternalLink, ArrowRight, Edit2, Plus, X, Check, Trash2, ArrowLeft, Play, Maximize2, LogIn, LogOut, Cloud } from "lucide-react";
import { Routes, Route, useNavigate, useParams, Link, useLocation } from "react-router-dom";
import { get, set } from "idb-keyval";
import { db, auth } from "./firebase";
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  query, 
  writeBatch,
  deleteDoc
} from "firebase/firestore";
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword,
  signOut,
  User 
} from "firebase/auth";

// Firestore Error Handling
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // In our case, we'll log it but maybe not throw to keep app running
  // throw new Error(JSON.stringify(errInfo));
}

type Category = string;

interface MediaItem {
  id: string;
  url: string;
  type: "image" | "video";
}

interface Project {
  id: string;
  title: string;
  category: Category;
  tag: string;
  gradient: string;
  mediaItems: MediaItem[];
  description?: string;
}

interface PageContent {
  title: string;
  content: string;
  mediaItems: MediaItem[];
}

interface ThemeSettings {
  backgroundColor: string;
  accentColor: string;
  logoColor: string;
  nameColor: string;
  projectTitleColor: string;
  textColor: string;
  categoryColor: string;
  categoryActiveColor: string;
  backgroundImageUrl: string | null;
  backgroundOpacity: number;
  backgroundBlur: number;
  layout: "sidebar-left" | "sidebar-right" | "top-nav";
  cardStyle: "minimal" | "glass" | "bordered";
}

const INITIAL_THEME: ThemeSettings = {
  backgroundColor: "#0A0A0A",
  accentColor: "#0081FF",
  logoColor: "#FFFFFF",
  nameColor: "#FFFFFF",
  projectTitleColor: "#FFFFFF",
  textColor: "#888888",
  categoryColor: "#888888",
  categoryActiveColor: "#FFFFFF",
  backgroundImageUrl: null,
  backgroundOpacity: 50,
  backgroundBlur: 10,
  layout: "sidebar-left",
  cardStyle: "minimal",
};

const DEFAULT_CATEGORIES = ["Selected", "Graphic", "Motion", "Pack", "IP Design"];

const INITIAL_PROJECTS: Project[] = [
  {
    id: "1",
    title: "AURORA 极光品牌视觉重塑",
    category: "Graphic",
    tag: "平面设计 / BRANDING",
    gradient: "linear-gradient(45deg, #121212, #2a2a2a)",
    mediaItems: [],
    description: "AURORA 品牌视觉重塑项目旨在通过极简主义与自然光的结合，打造一个高端、纯净的品牌形象。我们重新设计了 Logo、色彩系统以及全套视觉识别系统。",
  },
  {
    id: "2",
    title: "FUTURE PULSE 2024 动态影像",
    category: "Motion",
    tag: "动态设计 / MOTION",
    gradient: "linear-gradient(135deg, #1a1a1a, #004080)",
    mediaItems: [],
    description: "Future Pulse 2024 是为年度科技盛典制作的开场动态影像。通过粒子系统与流体动力学的结合，展现了科技与生命的律动。",
  },
  {
    id: "3",
    title: "NEO-BOT 潮流盲盒角色系列",
    category: "IP Design",
    tag: "IP设计 / CHARACTER",
    gradient: "linear-gradient(225deg, #222, #444)",
    mediaItems: [],
    description: "NEO-BOT 是一个面向 Z 世代的潮流 IP 角色系列。结合了赛博朋克元素与极简几何造型，旨在打造具有高辨识度的潮流资产。",
  },
  {
    id: "4",
    title: "ORIGIN TEA 极简茶饮包装",
    category: "Pack",
    tag: "包装设计 / PACKAGE",
    gradient: "linear-gradient(315deg, #111, #333)",
    mediaItems: [],
    description: "Origin Tea 包装设计强调“回归本源”。采用环保纸材与单色印刷，通过留白传达茶饮的纯净与宁静。",
  },
];

const INITIAL_PAGE_CONTENT: Record<string, PageContent> = {
  about: {
    title: "关于我 ABOUT",
    content: "我是一名多维设计师，专注于品牌视觉体系构建、动态视觉呈现与IP角色孵化。我相信设计不仅是视觉的呈现，更是品牌灵魂的表达。",
    mediaItems: [],
  },
  archive: {
    title: "归档 ARCHIVE",
    content: "这里记录了我过去几年的设计历程与项目积累。",
    mediaItems: [],
  },
  contact: {
    title: "联系我 CONTACT",
    content: "如果您有合作意向或任何问题，欢迎通过以下方式联系我：\nEmail: liam.chen@example.com\nWeChat: liam_design",
    mediaItems: [],
  },
};

function GlobalBackground({ settings }: { settings: ThemeSettings }) {
  return (
    <>
      <div 
        className="fixed inset-0 z-[-2]"
        style={{ backgroundColor: settings.backgroundColor }}
      />
      {settings.backgroundImageUrl && (
        <div 
          className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden"
          style={{ opacity: settings.backgroundOpacity / 100 }}
        >
          <img 
            src={settings.backgroundImageUrl} 
            alt="Background" 
            className="w-full h-full object-cover scale-110"
            style={{ filter: `blur(${settings.backgroundBlur}px)` }}
            referrerPolicy="no-referrer"
          />
        </div>
      )}
    </>
  );
}

  function ProjectDetail({ projects, updateProject, deleteProject, themeSettings, isAdmin }: { projects: Project[], updateProject: (p: Project) => void, deleteProject: (id: string) => void, themeSettings: ThemeSettings, isAdmin: boolean }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const project = projects.find(p => p.id === id);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  useEffect(() => {
    if (project) {
      setEditTitle(project.title);
      setEditDescription(project.description || "");
    }
  }, [project]);

  if (!project) return (
    <div className="min-h-screen flex flex-col items-center justify-center text-text-main relative">
      <GlobalBackground settings={themeSettings} />
      <h2 className="text-2xl mb-4">未找到该作品</h2>
      <button onClick={() => navigate("/")} className="text-accent flex items-center gap-2">
        <ArrowLeft size={20} /> 返回首页
      </button>
    </div>
  );

  const handleAddMedia = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newMediaItems: MediaItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = file.type.startsWith("video") ? "video" : "image";
      const url = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      newMediaItems.push({ id: Date.now().toString() + i, url, type });
    }

    updateProject({
      ...project,
      mediaItems: [...project.mediaItems, ...newMediaItems]
    });
  };

  const handleDeleteMedia = (mediaId: string) => {
    updateProject({
      ...project,
      mediaItems: project.mediaItems.filter(m => m.id !== mediaId)
    });
  };

  const handleSaveInfo = () => {
    updateProject({
      ...project,
      title: editTitle,
      description: editDescription
    });
    setIsEditing(false);
  };

  return (
    <motion.div 
      key={`project-detail-${project.id}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen text-text-main relative"
    >
      <GlobalBackground settings={themeSettings} />
      {/* Detail Header */}
      <nav className="h-20 px-6 md:px-16 flex justify-between items-center border-b border-border-custom sticky top-0 bg-background/80 backdrop-blur-md z-50">
        <button onClick={() => navigate("/")} className="flex items-center gap-2 text-text-dim hover:text-text-main transition-colors">
          <ArrowLeft size={20} /> 返回作品集
        </button>
          <div className="font-extrabold text-xl tracking-[0.2em] uppercase">PROJECT.DETAIL</div>
          {isAdmin && (
            <button 
              onClick={() => setIsEditing(!isEditing)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${isEditing ? "bg-accent text-white" : "bg-white/5 text-text-dim hover:bg-white/10"}`}
            >
              {isEditing ? <><Check size={16} /> 完成编辑</> : <><Edit2 size={16} /> 编辑项目</>}
            </button>
          )}
        </nav>

      <div className="max-w-6xl mx-auto px-6 py-12 md:py-20">
        {/* Info Section */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-12 mb-16">
          <motion.div 
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
          >
            <AnimatePresence mode="wait">
              {isEditing ? (
                <motion.div 
                  key={`project-edit-${project.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex flex-col gap-4"
                >
                  <input 
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="text-4xl md:text-6xl font-bold bg-transparent border-b border-border-custom outline-none focus:border-accent w-full pb-2"
                  />
                  <textarea 
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="text-text-dim text-lg leading-relaxed bg-transparent border border-border-custom p-4 rounded-xl outline-none focus:border-accent w-full h-48 resize-none"
                  />
                  <button onClick={handleSaveInfo} className="bg-accent text-white py-3 rounded-xl font-bold">保存文字信息</button>
                </motion.div>
              ) : (
                <motion.div 
                  key={`project-view-${project.id}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <h1 className="text-4xl md:text-6xl font-bold mb-6">{project.title}</h1>
                  <p className="text-text-dim text-lg leading-relaxed whitespace-pre-line">
                    {project.description || "该作品暂无详细描述。"}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <motion.div 
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col gap-8"
          >
            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-widest text-accent font-bold">Category</span>
              <span className="text-xl">{project.category}</span>
            </div>
            <div className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-widest text-accent font-bold">Services</span>
                <span className="text-xl">{project.tag.split(' / ')[1] || project.tag}</span>
              </div>
              
              {isAdmin && (
                <button 
                  onClick={() => {
                    if (confirm("确定要删除这个作品吗？")) {
                      deleteProject(project.id);
                      navigate("/");
                    }
                  }}
                  className="mt-4 flex items-center gap-2 text-red-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={18} /> 删除此项目
                </button>
              )}
            </motion.div>
        </div>

        {/* Media Gallery */}
        <div className="flex flex-col gap-8">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold">媒体展示 MEDIA</h3>
            {isEditing && (
              <label className="cursor-pointer bg-accent text-white px-6 py-2 rounded-full flex items-center gap-2 hover:bg-accent/80 transition-all">
                <Plus size={18} /> 添加图片/视频
                <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleAddMedia} />
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 gap-12">
            {project.mediaItems.length > 0 ? (
              project.mediaItems.map((item) => (
                <motion.div 
                  key={item.id}
                  layout
                  className="relative group w-full bg-surface rounded-3xl overflow-hidden border border-border-custom shadow-2xl"
                >
                  {item.type === "video" ? (
                    <video src={item.url} className="w-full h-full object-cover" controls loop muted />
                  ) : (
                    <img src={item.url} alt={project.title} className="w-full h-full object-cover" />
                  )}
                  
                  {isEditing && (
                    <button 
                      onClick={() => handleDeleteMedia(item.id)}
                      className="absolute top-6 right-6 p-3 bg-red-500 text-white rounded-full shadow-xl opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 size={20} />
                    </button>
                  )}
                </motion.div>
              ))
            ) : (
              <div className="w-full aspect-video bg-surface rounded-3xl flex flex-col items-center justify-center border border-dashed border-border-custom text-text-dim">
                <Maximize2 size={48} className="mb-4 opacity-20" />
                <p>暂无媒体内容</p>
                {isEditing && <p className="text-xs mt-2">点击上方按钮添加内容</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

  function GenericPage({ type, content, updateContent, themeSettings, isAdmin }: { type: string, content: PageContent, updateContent: (type: string, c: PageContent) => void, themeSettings: ThemeSettings, isAdmin: boolean }) {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(content.title);
  const [editContent, setEditContent] = useState(content.content);

  useEffect(() => {
    setEditTitle(content.title);
    setEditContent(content.content);
  }, [content]);

  const handleAddMedia = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newMediaItems: MediaItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const type = file.type.startsWith("video") ? "video" : "image";
      const url = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      newMediaItems.push({ id: Date.now().toString() + i, url, type });
    }

    updateContent(type, {
      ...content,
      mediaItems: [...content.mediaItems, ...newMediaItems]
    });
  };

  const handleDeleteMedia = (mediaId: string) => {
    updateContent(type, {
      ...content,
      mediaItems: content.mediaItems.filter(m => m.id !== mediaId)
    });
  };

  const handleSave = () => {
    updateContent(type, {
      ...content,
      title: editTitle,
      content: editContent
    });
    setIsEditing(false);
  };

  return (
    <motion.div 
      key={`generic-page-${type}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen text-text-main relative"
    >
      <GlobalBackground settings={themeSettings} />
      <nav className="h-20 px-6 md:px-16 flex justify-between items-center border-b border-border-custom sticky top-0 bg-background/80 backdrop-blur-md z-50">
        <button onClick={() => navigate("/")} className="flex items-center gap-2 text-text-dim hover:text-text-main transition-colors">
          <ArrowLeft size={20} /> 返回首页
        </button>
        <div className="font-extrabold text-xl tracking-[0.2em] uppercase">{type.toUpperCase()}</div>
        {isAdmin && (
          <button 
            onClick={() => setIsEditing(!isEditing)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${isEditing ? "bg-accent text-white" : "bg-white/5 text-text-dim hover:bg-white/10"}`}
          >
            {isEditing ? <><Check size={16} /> 完成编辑</> : <><Edit2 size={16} /> 编辑页面</>}
          </button>
        )}
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-12 md:py-20">
        <div className="mb-16">
          <AnimatePresence mode="wait">
            {isEditing ? (
              <motion.div 
                key={`${type}-edit-form`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col gap-6"
              >
                <input 
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="text-4xl md:text-6xl font-bold bg-transparent border-b border-border-custom outline-none focus:border-accent w-full pb-2"
                />
                <textarea 
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="text-text-dim text-lg leading-relaxed bg-transparent border border-border-custom p-4 rounded-xl outline-none focus:border-accent w-full h-64 resize-none"
                />
                <button onClick={handleSave} className="bg-accent text-white py-3 rounded-xl font-bold">保存文字信息</button>
              </motion.div>
            ) : (
              <motion.div 
                key={`${type}-view-content`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <h1 className="text-4xl md:text-6xl font-bold mb-8">{content.title}</h1>
                <p className="text-text-dim text-lg leading-relaxed whitespace-pre-line">{content.content}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex flex-col gap-8">
          <div className="flex justify-between items-center border-b border-border-custom pb-4">
            <h3 className="text-xl font-bold">媒体展示 MEDIA</h3>
            {isEditing && (
              <label className="cursor-pointer bg-accent text-white px-6 py-2 rounded-full flex items-center gap-2 hover:bg-accent/80 transition-all">
                <Plus size={18} /> 添加图片/视频
                <input type="file" multiple accept="image/*,video/*" className="hidden" onChange={handleAddMedia} />
              </label>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {content.mediaItems.map((item) => (
              <motion.div 
                key={item.id}
                layout
                className="relative group aspect-square bg-surface rounded-2xl overflow-hidden border border-border-custom"
              >
                {item.type === "video" ? (
                  <video src={item.url} className="w-full h-full object-cover" controls loop muted />
                ) : (
                  <img src={item.url} alt="Media" className="w-full h-full object-cover" />
                )}
                
                {isEditing && (
                  <button 
                    onClick={() => handleDeleteMedia(item.id)}
                    className="absolute top-4 right-4 p-2 bg-red-500 text-white rounded-full shadow-xl opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

  function PortfolioHome({ 
    websiteName, userName, userRole, userBio, projects, activeCategory, setActiveCategory, 
    categories, setCategories,
    isEditingProfile, setIsEditingProfile, setUserName, setUserRole, setUserBio, saveProfile,
    setShowUploadModal, deleteProject, avatarUrl, themeSettings, setShowSettingsModal, setAvatarUrl,
    isAdmin, handleLoginClick, handleLogoutAdmin
  }: any) {
  const navigate = useNavigate();
  
  const filteredProjects = activeCategory === "Selected" 
    ? projects.slice(0, 4) 
    : activeCategory === "All" 
      ? projects 
      : projects.filter((p: any) => p.category === activeCategory);

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <motion.div 
      key="home-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col transition-colors duration-500 selection:bg-accent selection:text-white relative"
    >
      <GlobalBackground settings={themeSettings} />
      {/* Navbar */}
      <nav 
        className="h-20 px-6 md:px-16 flex justify-between items-center border-b border-border-custom sticky top-0 backdrop-blur-md z-50 transition-colors duration-500"
        style={{ backgroundColor: `${themeSettings.backgroundColor}CC` }}
      >
        <Link 
          to="/" 
          className="font-extrabold text-xl tracking-[0.2em] uppercase"
          style={{ color: themeSettings.logoColor }}
        >
          {websiteName}
        </Link>
        <div className="hidden md:flex gap-10">
          <Link to="/" className="nav-link">WORKS</Link>
          <Link to="/about" className="nav-link">ABOUT</Link>
          <Link to="/archive" className="nav-link">ARCHIVE</Link>
          <Link to="/contact" className="nav-link">CONTACT</Link>
          {isAdmin ? (
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setShowSettingsModal(true)}
                className="bg-accent/10 text-accent hover:bg-accent hover:text-white p-2 px-3 rounded-xl transition-all flex items-center gap-2 text-xs font-bold"
              >
                <Edit2 size={14} /> SETTINGS
              </button>
              <button 
                onClick={handleLogoutAdmin}
                className="text-text-dim hover:text-red-500 transition-colors"
                title="Google Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <button 
              onClick={handleLoginClick}
              className="bg-accent/5 text-accent hover:bg-accent/20 p-2 px-4 rounded-xl transition-all flex items-center gap-2 text-xs font-medium"
            >
              <LogIn size={14} /> 后台入口
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button className="md:hidden text-text-main">
            <Mail size={20} />
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div className={`flex-1 grid grid-cols-1 ${themeSettings.layout === 'sidebar-right' ? 'lg:grid-cols-[1fr_360px]' : themeSettings.layout === 'top-nav' ? 'lg:grid-cols-1' : 'lg:grid-cols-[360px_1fr]'} px-6 md:px-16 py-10 gap-10 lg:gap-16 max-w-[1600px] mx-auto w-full`}>
        {/* Profile Section */}
          <aside className={`flex flex-col ${themeSettings.layout === 'sidebar-right' ? 'lg:order-2' : ''} ${themeSettings.layout === 'top-nav' ? 'hidden' : ''}`}>
            <div className="relative group w-24 h-24 mb-8">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full h-full rounded-full border border-border-custom shadow-xl overflow-hidden bg-surface"
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-linear-to-br from-[#1a1a1a] to-[#333]" />
                )}
              </motion.div>
              <div className="absolute top-0 -right-4">
                <Cloud size={18} className={isAdmin ? "text-accent animate-pulse" : "text-text-dim opacity-30"} />
              </div>
              {isAdmin && (
                <label className="absolute -bottom-1 -right-1 w-10 h-10 bg-accent rounded-full flex items-center justify-center text-white shadow-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:scale-110 active:scale-95 transition-all">
                  <Plus size={18} />
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                </label>
              )}
            </div>
  
            {isAdmin && isEditingProfile ? (
            <div className="flex flex-col gap-4 mb-8 bg-surface p-6 rounded-xl border border-border-custom shadow-2xl">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-accent uppercase tracking-widest">编辑个人资料 EDIT PROFILE</span>
                <button onClick={() => setIsEditingProfile(false)} className="text-text-dim hover:text-text-main"><X size={16} /></button>
              </div>
              <input 
                value={userName} 
                onChange={(e) => setUserName(e.target.value)}
                className="bg-background border border-border-custom p-3 rounded-lg text-2xl font-bold text-text-main focus:border-accent outline-none"
                placeholder="姓名 Name"
              />
              <input 
                value={userRole} 
                onChange={(e) => setUserRole(e.target.value)}
                className="bg-background border border-border-custom p-3 rounded-lg text-sm text-accent focus:border-accent outline-none font-semibold"
                placeholder="职位 Role"
              />
              <textarea 
                value={userBio} 
                onChange={(e) => setUserBio(e.target.value)}
                className="bg-background border border-border-custom p-3 rounded-lg text-sm text-text-dim h-32 focus:border-accent outline-none resize-none leading-relaxed"
                placeholder="简介 Bio"
              />
              <div className="flex gap-3 mt-2">
                <button onClick={saveProfile} className="flex-1 bg-accent text-white py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-accent/80 transition-all font-bold shadow-lg shadow-accent/20">
                  <Check size={18} /> 保存修改
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between mb-4">
                  <motion.h1 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="text-5xl md:text-6xl font-bold leading-[1.1] whitespace-pre-line"
                    style={{ color: themeSettings.nameColor }}
                  >
                    {userName.replace(' ', '\n')}
                  </motion.h1>
                  {isAdmin && (
                    <button 
                      onClick={() => setIsEditingProfile(true)}
                      className="p-2 bg-white/5 text-text-dim hover:bg-accent hover:text-white rounded-full transition-all"
                      title="编辑资料"
                    >
                      <Edit2 size={16} />
                    </button>
                  )}
                </div>
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-sm uppercase tracking-[0.2em] mb-8 font-semibold"
                style={{ color: themeSettings.accentColor }}
              >
                {userRole}
              </motion.div>
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="leading-relaxed mb-10 max-w-xs"
                style={{ color: themeSettings.textColor }}
              >
                {userBio}
              </motion.p>
            </>
          )}
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex gap-4"
          >
            <a href="#" className="social-btn"><Github size={18} /></a>
            <a href="#" className="social-btn"><Linkedin size={18} /></a>
            <a href="#" className="social-btn"><Twitter size={18} /></a>
            <a href="#" className="social-btn"><Mail size={18} /></a>
          </motion.div>
        </aside>

        {/* Work Section */}
        <main className="flex flex-col gap-8">
          {/* Category Nav */}
          <div className="flex flex-wrap items-center gap-3 mb-2">
            {categories.map((cat: string) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`cat-pill ${activeCategory === cat ? "active" : ""}`}
                style={activeCategory === cat 
                  ? { backgroundColor: themeSettings.accentColor, borderColor: themeSettings.accentColor, color: themeSettings.categoryActiveColor } 
                  : { color: themeSettings.categoryColor }
                }
              >
                {cat}
              </button>
            ))}
              {isAdmin && (
                <button 
                  onClick={() => setShowUploadModal(true)}
                  className="w-10 h-10 rounded-full border border-dashed border-border-custom flex items-center justify-center text-text-dim hover:border-accent hover:text-accent transition-all"
                >
                  <Plus size={20} />
                </button>
              )}
            </div>

          {/* Work Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <AnimatePresence mode="popLayout">
              {filteredProjects.map((project: any) => (
                <motion.div
                  layout
                  key={project.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className={`work-card group ${themeSettings.cardStyle === 'glass' ? 'bg-white/5 backdrop-blur-md border-white/10' : themeSettings.cardStyle === 'bordered' ? 'border-2 border-border-custom' : ''}`}
                  onClick={() => navigate(`/project/${project.id}`)}
                >
                  {project.mediaItems?.[0] ? (
                    project.mediaItems[0].type === "video" ? (
                      <video 
                        src={project.mediaItems[0].url} 
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-500"
                        autoPlay
                        muted
                        loop
                        playsInline
                      />
                    ) : (
                      <img 
                        src={project.mediaItems[0].url} 
                        alt={project.title}
                        className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-500"
                      />
                    )
                  ) : (
                    <div 
                      className="w-full h-full opacity-60 group-hover:opacity-100 transition-opacity duration-500"
                      style={{ backgroundImage: project.gradient, backgroundSize: 'cover', backgroundPosition: 'center' }}
                    />
                  )}
                  
                  <div className="card-overlay translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100">
                    <div className="flex justify-between items-start">
                        <span className="card-tag">{project.tag}</span>
                        {isAdmin && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                            className="p-2 bg-red-500/20 text-red-500 rounded-full hover:bg-red-500 hover:text-white transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    <span 
                      className="card-title"
                      style={{ color: themeSettings.projectTitleColor }}
                    >
                      {project.title}
                    </span>
                    <div 
                      className="mt-2 flex items-center gap-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: themeSettings.accentColor }}
                    >
                      查看详情 <ArrowRight size={12} />
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </motion.div>
  );
}

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends (Component as any) {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "40px", color: "white", background: "#0a0a0a", minHeight: "100vh", fontFamily: "sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <h1 style={{ color: "#0081FF", fontSize: "40px", marginBottom: "20px" }}>修复模式</h1>
          <p style={{ maxWidth: "600px", lineHeight: "1.6", color: "#888" }}>
            由于数据或环境冲突，页面加载遇到了一点小波折。
          </p>
          <pre style={{ background: "#222", padding: "10px", borderRadius: "5px", color: "#ff4444", marginTop: "20px", fontSize: "12px", textAlign: "left", whiteSpace: "pre-wrap", overflowX: "auto", maxWidth: "90vw" }}>
            {this.state.error?.message || this.state.error?.toString()}
          </pre>
          <button 
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            style={{ padding: "12px 30px", background: "#0081FF", border: "none", color: "white", borderRadius: "8px", marginTop: "30px", cursor: "pointer", fontWeight: "bold" }}
          >
            清除缓存并重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  // State for categories
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [activeCategory, setActiveCategory] = useState<string>("Selected");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  // State for user info
  const [websiteName, setWebsiteName] = useState("LIAM.C");
  const [userName, setUserName] = useState("Liam Chen");
  const [userRole, setUserRole] = useState("多维设计师 / Art Director");
  const [userBio, setUserBio] = useState("专注品牌视觉体系构建、动态视觉呈现与IP角色孵化。通过简约、有力的设计语言，为品牌创造可持续传播的视觉资产。");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  
  // State for projects
  const [projects, setProjects] = useState<Project[]>(INITIAL_PROJECTS);
  
  // State for page contents
  const [pageContents, setPageContents] = useState<Record<string, PageContent>>(INITIAL_PAGE_CONTENT);

  // State for theme
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(INITIAL_THEME);

  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const isAdmin = currentUser?.email === "qic67881@gmail.com";

  // Auth Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setIsAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Fetch all data from proxy API on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/data");
        const data = await res.json();
        
        if (data.config) {
          const d = data.config;
          if (d.websiteName) setWebsiteName(d.websiteName);
          if (d.userName) setUserName(d.userName);
          if (d.userRole) setUserRole(d.userRole);
          if (d.userBio) setUserBio(d.userBio);
          if (d.avatarUrl) setAvatarUrl(d.avatarUrl);
          if (d.categories) setCategories(d.categories);
        }
        if (data.theme) setThemeSettings(data.theme);
        if (data.projects) setProjects(data.projects);
        if (data.pages) setPageContents(data.pages);
      } catch (err) {
        console.error("Failed to fetch data from API:", err);
      }
    };
    
    fetchData();
  }, []);

  // Sync to Firebase helper (now uses Proxy API)
  const saveToFirebase = async (path: string, docId: string, data: any) => {
    if (!isAdmin) return;
    try {
      // Create a payload that the server expects
      const payload: any = {};
      if (path === "settings" && docId === "config") payload.config = data;
      if (path === "settings" && docId === "theme") payload.theme = data;
      if (path === "projects") payload.projects = [data]; // The server handles merging
      if (path === "pages") payload.pages = { [docId]: data };

      await fetch("/api/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: payload,
          token: "public-access" // Using the simple token from server.ts
        })
      });
    } catch (err) {
      console.error("Failed to save to Proxy API:", err);
    }
  };

  const handleEmailLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setIsLoggingIn(true);
    
    try {
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      setShowLoginModal(false);
      setLoginEmail("");
      setLoginPassword("");
    } catch (err: any) {
      console.error("Login Error:", err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setLoginError("邮箱或密码错误，请检查。");
      } else if (err.code === 'auth/too-many-requests') {
        setLoginError("尝试次数过多，请稍后再试。");
      } else {
        setLoginError(`登录失败: ${err.message}`);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogoutAdmin = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // Effect to automatically persist changes to Firebase (Debounced to avoid loops)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAuthReady && isAdmin) {
        saveToFirebase("settings", "config", {
          websiteName, userName, userRole, userBio, avatarUrl, categories
        });
      }
    }, 2000); // 2-second debounce
    
    return () => clearTimeout(timer);
  }, [websiteName, userName, userRole, userBio, avatarUrl, categories, isAuthReady, isAdmin]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (isAuthReady && isAdmin) {
        saveToFirebase("settings", "theme", themeSettings);
      }
    }, 2000); // 2-second debounce

    return () => clearTimeout(timer);
  }, [themeSettings, isAuthReady, isAdmin]);

  // Save Profile
  const saveProfile = async () => {
    if (!isAdmin) return;
    setIsEditingProfile(false);
    await saveToFirebase("settings", "config", {
      websiteName, userName, userRole, userBio, avatarUrl, categories
    });
  };

  const addProject = async (newProjectData: { title: string; category: Category; tag: string; color: string; description: string; file?: File; externalUrl?: string }) => {
    if (!isAdmin) return;
    setIsUploading(true);
    const mediaItems: MediaItem[] = [];

    if (newProjectData.externalUrl) {
      const type = newProjectData.externalUrl.match(/\.(mp4|webm|ogg)$/i) ? "video" : "image";
      mediaItems.push({ id: Date.now().toString(), url: newProjectData.externalUrl, type });
    } else if (newProjectData.file) {
      const file = newProjectData.file;
      const type = file.type.startsWith("video") ? "video" : "image";
      const url = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      mediaItems.push({ id: Date.now().toString(), url, type });
    }

    const newProject: Project = {
      id: Date.now().toString(),
      title: newProjectData.title,
      category: newProjectData.category,
      tag: newProjectData.tag,
      description: newProjectData.description,
      gradient: `linear-gradient(${Math.floor(Math.random() * 360)}deg, #1a1a1a, ${newProjectData.color || "#0081FF"})`,
      mediaItems,
    };

    setProjects(prev => [...prev, newProject]);
    if (isAdmin) {
      try {
        await setDoc(doc(db, "projects", newProject.id), newProject);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `projects/${newProject.id}`);
      }
    }
    
    setIsUploading(false);
    setShowUploadModal(false);
  };

  const updateProject = async (updatedProject: Project) => {
    if (!isAdmin) return;
    setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
    try {
      await setDoc(doc(db, "projects", updatedProject.id), updatedProject);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `projects/${updatedProject.id}`);
    }
  };

  const deleteProject = async (id: string) => {
    if (!isAdmin) return;
    setProjects(prev => prev.filter(p => p.id !== id));
    try {
      await deleteDoc(doc(db, "projects", id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `projects/${id}`);
    }
  };

  const updatePageContent = async (type: string, content: PageContent) => {
    if (!isAdmin) return;
    setPageContents(prev => ({ ...prev, [type]: content }));
    try {
      await setDoc(doc(db, "pages", type), content);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `pages/${type}`);
    }
  };

  const location = useLocation();

  return (
    <ErrorBoundary>
      <AnimatePresence mode="wait">
        <Routes location={location}>
          <Route path="/" element={
            <PortfolioHome 
              websiteName={websiteName}
              userName={userName}
              userRole={userRole}
              userBio={userBio}
              projects={projects}
              activeCategory={activeCategory}
              setActiveCategory={setActiveCategory}
              categories={categories}
              setCategories={setCategories}
              isEditingProfile={isEditingProfile}
              setIsEditingProfile={setIsEditingProfile}
              setUserName={setUserName}
              setUserRole={setUserRole}
              setUserBio={setUserBio}
              saveProfile={saveProfile}
              setShowUploadModal={setShowUploadModal}
              deleteProject={deleteProject}
              avatarUrl={avatarUrl}
              themeSettings={themeSettings}
              setShowSettingsModal={setShowSettingsModal}
              setAvatarUrl={setAvatarUrl}
              isAdmin={isAdmin}
              handleLoginClick={() => setShowLoginModal(true)}
              handleLogoutAdmin={handleLogoutAdmin}
            />
          } />
          <Route path="/project/:id" element={<ProjectDetail projects={projects} updateProject={updateProject} deleteProject={deleteProject} themeSettings={themeSettings} isAdmin={isAdmin} />} />
          <Route path="/about" element={<GenericPage type="about" content={pageContents.about} updateContent={updatePageContent} themeSettings={themeSettings} isAdmin={isAdmin} />} />
          <Route path="/archive" element={<GenericPage type="archive" content={pageContents.archive} updateContent={updatePageContent} themeSettings={themeSettings} isAdmin={isAdmin} />} />
          <Route path="/contact" element={<GenericPage type="contact" content={pageContents.contact} updateContent={updatePageContent} themeSettings={themeSettings} isAdmin={isAdmin} />} />
        </Routes>
      </AnimatePresence>

      {/* Login Modal */}
      <AnimatePresence mode="wait">
        {showLoginModal && (
          <div key="login-modal-overlay" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              key="login-bg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isLoggingIn && setShowLoginModal(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              key="login-content-box"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-[#111] border border-white/10 rounded-2xl p-8 shadow-2xl overflow-hidden"
            >
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white">后台管理入口</h2>
                  <p className="text-[10px] text-text-dim mt-1 uppercase tracking-widest font-mono">ADMIN AUTHORIZATION</p>
                </div>
                <button 
                  onClick={() => setShowLoginModal(false)} 
                  disabled={isLoggingIn}
                  className="text-text-dim hover:text-white transition-all hover:rotate-90"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleEmailLogin} className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-text-dim">管理邮箱 Admin Email</label>
                  <input 
                    type="email" 
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="example@gmail.com"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent transition-all text-white"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-text-dim">登录密码 Password</label>
                  <input 
                    type="password" 
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent transition-all text-white"
                  />
                </div>

                {loginError && (
                  <div className="bg-red-500/10 border border-red-500/20 text-red-500 text-[11px] py-3 px-4 rounded-xl flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-red-500" />
                    {loginError}
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={isLoggingIn}
                  className="w-full py-4 bg-accent hover:bg-accent/90 text-white rounded-xl font-bold transition-all transform hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-accent/20 disabled:opacity-50 disabled:cursor-wait flex items-center justify-center gap-2"
                >
                  {isLoggingIn ? "验证中..." : "验证并进入管理模式"}
                </button>
              </form>

              <div className="mt-8 pt-6 border-t border-white/5 text-center">
                <p className="text-[10px] text-text-dim leading-relaxed">
                  请注意：仅限管理员账号访问。<br/>
                  如果您忘记了密码，请在 Firebase 控制台重置。
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* Upload Modal */}
      <AnimatePresence mode="wait">
        {showUploadModal && (
          <div key="upload-modal-overlay" className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              key="upload-bg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowUploadModal(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div 
              key="upload-content-box"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-surface border border-border-custom rounded-2xl p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold">上传新作品</h2>
                <button onClick={() => setShowUploadModal(false)} className="text-text-dim hover:text-text-main">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const fileInput = e.currentTarget.querySelector('input[type="file"]') as HTMLInputElement;
                const file = fileInput.files?.[0];
                
                await addProject({
                  title: formData.get("title") as string,
                  category: formData.get("category") as Category,
                  tag: formData.get("tag") as string,
                  description: formData.get("description") as string,
                  color: formData.get("color") as string,
                  file: file,
                  externalUrl: formData.get("externalUrl") as string,
                });
              }} className="flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-widest text-text-dim">作品标题</label>
                  <input name="title" required className="bg-background border border-border-custom p-3 rounded-lg outline-none focus:border-accent" placeholder="例如: AURORA 品牌重塑" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs uppercase tracking-widest text-text-dim">分类</label>
                    <select name="category" className="bg-background border border-border-custom p-3 rounded-lg outline-none focus:border-accent">
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs uppercase tracking-widest text-text-dim">标签</label>
                    <input name="tag" required className="bg-background border border-border-custom p-3 rounded-lg outline-none focus:border-accent" placeholder="例如: 平面设计 / BRANDING" />
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-widest text-text-dim">作品描述</label>
                  <textarea name="description" className="bg-background border border-border-custom p-3 rounded-lg outline-none focus:border-accent h-24 resize-none" placeholder="详细介绍您的创作思路..." />
                </div>

                <div className="flex flex-col gap-4 p-4 bg-white/5 rounded-xl border border-dashed border-border-custom">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs uppercase tracking-widest text-text-dim">媒体文件 (图片或视频)</label>
                    <input 
                      type="file" 
                      accept="image/*,video/*" 
                      className="bg-background border border-border-custom p-3 rounded-lg outline-none focus:border-accent file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-accent file:text-white hover:file:bg-accent/80" 
                    />
                    <p className="text-[10px] text-text-dim italic">注：直接上传的文件体积过大可能导致保存失败。</p>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="h-px flex-1 bg-border-custom" />
                    <span className="text-[10px] text-text-dim uppercase">或者 OR</span>
                    <div className="h-px flex-1 bg-border-custom" />
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-xs uppercase tracking-widest text-text-dim">媒体 URL 链接 (支持大视频)</label>
                    <input name="externalUrl" className="bg-background border border-border-custom p-3 rounded-lg outline-none focus:border-accent text-sm" placeholder="https://example.com/video.mp4" />
                    <p className="text-[10px] text-text-dim">推荐将大视频上传到图床或云存储后贴入链接，速度极快且无大小限制。</p>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs uppercase tracking-widest text-text-dim">备用主题色</label>
                  <input name="color" type="color" defaultValue="#0081FF" className="w-full h-12 bg-transparent border-none cursor-pointer" />
                </div>

                <button 
                  type="submit" 
                  disabled={isUploading}
                  className="w-full bg-accent text-white py-4 rounded-xl font-bold hover:bg-accent/80 transition-all mt-4 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                      />
                      处理中...
                    </>
                  ) : "发布作品"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence mode="wait">
        {showSettingsModal && (
          <div key="settings-modal-overlay" className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              key="settings-bg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettingsModal(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div 
              key="settings-content-box"
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-surface border border-border-custom rounded-2xl p-8 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold">网站与个人设置 SETTINGS</h2>
                <button onClick={() => setShowSettingsModal(false)} className="text-text-dim hover:text-text-main">
                  <X size={24} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* Left Column: Appearance */}
                <div className="flex flex-col gap-8">
                  <h3 className="text-sm font-bold text-accent uppercase tracking-widest border-b border-border-custom pb-2">外观定制 Appearance</h3>
                  
                  {/* Website Name */}
                  <div className="flex flex-col gap-3">
                    <label className="text-xs uppercase tracking-widest text-text-dim font-bold">网站名称 (Logo文字)</label>
                    <input 
                      value={websiteName}
                      onChange={(e) => setWebsiteName(e.target.value)}
                      className="bg-background border border-border-custom p-3 rounded-lg outline-none focus:border-accent text-sm"
                      placeholder="例如: LIAM.C"
                    />
                  </div>

                  {/* Background Color */}
                  <div className="flex flex-col gap-3">
                    <label className="text-xs uppercase tracking-widest text-text-dim font-bold">背景颜色 Background</label>
                    <div className="flex flex-wrap gap-3">
                      {["#0A0A0A", "#1A1A1A", "#000000", "#0F172A"].map((color) => (
                        <button 
                          key={color}
                          onClick={() => setThemeSettings({ ...themeSettings, backgroundColor: color })}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${themeSettings.backgroundColor === color ? "border-accent scale-110" : "border-transparent"}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                      <input 
                        type="color" 
                        value={themeSettings.backgroundColor}
                        onChange={(e) => setThemeSettings({ ...themeSettings, backgroundColor: e.target.value })}
                        className="w-8 h-8 rounded-full bg-transparent border-none cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Accent Color */}
                  <div className="flex flex-col gap-3">
                    <label className="text-xs uppercase tracking-widest text-text-dim font-bold">强调色 Accent</label>
                    <div className="flex flex-wrap gap-3">
                      {["#0081FF", "#FF3B30", "#34C759", "#AF52DE", "#FF9500"].map((color) => (
                        <button 
                          key={color}
                          onClick={() => setThemeSettings({ ...themeSettings, accentColor: color })}
                          className={`w-8 h-8 rounded-full border-2 transition-all ${themeSettings.accentColor === color ? "border-white scale-110" : "border-transparent"}`}
                          style={{ backgroundColor: color }}
                        />
                      ))}
                      <input 
                        type="color" 
                        value={themeSettings.accentColor}
                        onChange={(e) => setThemeSettings({ ...themeSettings, accentColor: e.target.value })}
                        className="w-8 h-8 rounded-full bg-transparent border-none cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Text Colors Section */}
                  <div className="flex flex-col gap-4 p-4 bg-white/5 rounded-xl border border-border-custom">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-dim">文字颜色 Text Colors</h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] uppercase text-text-dim">网站 Logo</label>
                        <input 
                          type="color" 
                          value={themeSettings.logoColor}
                          onChange={(e) => setThemeSettings({ ...themeSettings, logoColor: e.target.value })}
                          className="w-full h-8 bg-transparent border-none cursor-pointer"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] uppercase text-text-dim">个人姓名</label>
                        <input 
                          type="color" 
                          value={themeSettings.nameColor}
                          onChange={(e) => setThemeSettings({ ...themeSettings, nameColor: e.target.value })}
                          className="w-full h-8 bg-transparent border-none cursor-pointer"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] uppercase text-text-dim">作品标题</label>
                        <input 
                          type="color" 
                          value={themeSettings.projectTitleColor}
                          onChange={(e) => setThemeSettings({ ...themeSettings, projectTitleColor: e.target.value })}
                          className="w-full h-8 bg-transparent border-none cursor-pointer"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] uppercase text-text-dim">正文简介</label>
                        <input 
                          type="color" 
                          value={themeSettings.textColor}
                          onChange={(e) => setThemeSettings({ ...themeSettings, textColor: e.target.value })}
                          className="w-full h-8 bg-transparent border-none cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Background Image Section */}
                  <div className="flex flex-col gap-4 p-4 bg-white/5 rounded-xl border border-border-custom">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-dim">背景图 Background Image</h4>
                    
                    <div className="flex items-center gap-4">
                      {themeSettings.backgroundImageUrl ? (
                        <div className="relative group w-16 h-16 rounded-lg overflow-hidden border border-border-custom">
                          <img src={themeSettings.backgroundImageUrl} className="w-full h-full object-cover" />
                          <button 
                            onClick={() => setThemeSettings({ ...themeSettings, backgroundImageUrl: null })}
                            className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ) : (
                        <label className="w-16 h-16 rounded-lg border-2 border-dashed border-border-custom flex items-center justify-center text-text-dim hover:border-accent hover:text-accent cursor-pointer transition-all">
                          <Plus size={20} />
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  setThemeSettings({ ...themeSettings, backgroundImageUrl: reader.result as string });
                                };
                                reader.readAsDataURL(file);
                              }
                            }} 
                          />
                        </label>
                      )}
                      <div className="flex-1 flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-[10px] uppercase text-text-dim">
                            <span>透明度 Opacity</span>
                            <span>{themeSettings.backgroundOpacity}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="0" max="100" 
                            value={themeSettings.backgroundOpacity}
                            onChange={(e) => setThemeSettings({ ...themeSettings, backgroundOpacity: parseInt(e.target.value) })}
                            className="w-full accent-accent h-1 bg-white/10 rounded-full appearance-none"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-[10px] uppercase text-text-dim">
                            <span>模糊度 Blur</span>
                            <span>{themeSettings.backgroundBlur}px</span>
                          </div>
                          <input 
                            type="range" 
                            min="0" max="50" 
                            value={themeSettings.backgroundBlur}
                            onChange={(e) => setThemeSettings({ ...themeSettings, backgroundBlur: parseInt(e.target.value) })}
                            className="w-full accent-accent h-1 bg-white/10 rounded-full appearance-none"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Layout */}
                  <div className="flex flex-col gap-3">
                    <label className="text-xs uppercase tracking-widest text-text-dim font-bold">布局模式 Layout</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "sidebar-left", label: "左侧" },
                        { id: "sidebar-right", label: "右侧" },
                        { id: "top-nav", label: "全宽" }
                      ].map((opt) => (
                        <button 
                          key={opt.id}
                          onClick={() => setThemeSettings({ ...themeSettings, layout: opt.id as any })}
                          className={`py-2 px-1 rounded-lg border text-[10px] transition-all ${themeSettings.layout === opt.id ? "bg-accent text-white border-accent" : "bg-white/5 border-border-custom text-text-dim hover:bg-white/10"}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Card Style */}
                  <div className="flex flex-col gap-3">
                    <label className="text-xs uppercase tracking-widest text-text-dim font-bold">卡片样式 Card</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "minimal", label: "极简" },
                        { id: "glass", label: "毛玻璃" },
                        { id: "bordered", label: "描边" }
                      ].map((opt) => (
                        <button 
                          key={opt.id}
                          onClick={() => setThemeSettings({ ...themeSettings, cardStyle: opt.id as any })}
                          className={`py-2 px-1 rounded-lg border text-[10px] transition-all ${themeSettings.cardStyle === opt.id ? "bg-accent text-white border-accent" : "bg-white/5 border-border-custom text-text-dim hover:bg-white/10"}`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Category Management */}
                  <div className="flex flex-col gap-4 p-4 bg-white/5 rounded-xl border border-border-custom">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-dim">模块管理 Modules</h4>
                    
                    <div className="flex flex-col gap-2">
                      {categories.map((cat, index) => (
                        <div key={index} className="flex items-center justify-between gap-2 bg-background p-2 rounded-lg border border-border-custom">
                          <input 
                            value={cat}
                            onChange={(e) => {
                              const newCats = [...categories];
                              newCats[index] = e.target.value;
                              setCategories(newCats);
                            }}
                            className="bg-transparent border-none outline-none text-xs flex-1"
                          />
                          <button 
                            onClick={() => {
                              if (categories.length > 1) {
                                setCategories(categories.filter((_, i) => i !== index));
                              }
                            }}
                            className="text-red-500 hover:text-red-400 p-1"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <input 
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="新模块名称..."
                        className="bg-background border border-border-custom p-2 rounded-lg outline-none focus:border-accent text-xs flex-1"
                      />
                      <button 
                        onClick={() => {
                          if (newCategoryName.trim() && !categories.includes(newCategoryName.trim())) {
                            setCategories([...categories, newCategoryName.trim()]);
                            setNewCategoryName("");
                          }
                        }}
                        className="bg-accent text-white p-2 rounded-lg hover:bg-accent/80"
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-2 pt-2 border-t border-border-custom">
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] uppercase text-text-dim">模块文字颜色</label>
                        <input 
                          type="color" 
                          value={themeSettings.categoryColor}
                          onChange={(e) => setThemeSettings({ ...themeSettings, categoryColor: e.target.value })}
                          className="w-full h-8 bg-transparent border-none cursor-pointer"
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[10px] uppercase text-text-dim">激活模块颜色</label>
                        <input 
                          type="color" 
                          value={themeSettings.categoryActiveColor}
                          onChange={(e) => setThemeSettings({ ...themeSettings, categoryActiveColor: e.target.value })}
                          className="w-full h-8 bg-transparent border-none cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Profile */}
                <div className="flex flex-col gap-8">
                  <h3 className="text-sm font-bold text-accent uppercase tracking-widest border-b border-border-custom pb-2">个人信息 Profile</h3>
                  
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs uppercase tracking-widest text-text-dim font-bold">姓名 Name</label>
                      <input 
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        onBlur={saveProfile}
                        className="bg-background border border-border-custom p-3 rounded-lg outline-none focus:border-accent text-sm"
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-xs uppercase tracking-widest text-text-dim font-bold">职位 Role</label>
                      <input 
                        value={userRole}
                        onChange={(e) => setUserRole(e.target.value)}
                        onBlur={saveProfile}
                        className="bg-background border border-border-custom p-3 rounded-lg outline-none focus:border-accent text-sm"
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <label className="text-xs uppercase tracking-widest text-text-dim font-bold">简介 Bio</label>
                      <textarea 
                        value={userBio}
                        onChange={(e) => setUserBio(e.target.value)}
                        onBlur={saveProfile}
                        className="bg-background border border-border-custom p-3 rounded-lg outline-none focus:border-accent text-sm h-32 resize-none"
                      />
                    </div>
                  </div>

                  <div className="mt-auto p-4 bg-white/5 rounded-xl border border-border-custom">
                    <p className="text-[10px] text-text-dim leading-relaxed">
                      提示：个人信息修改后会自动保存。您可以直接在首页点击头像旁的编辑图标进行快速修改。
                    </p>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => setShowSettingsModal(false)}
                className="w-full bg-accent text-white py-4 rounded-xl font-bold hover:bg-accent/80 transition-all mt-10"
              >
                保存并关闭
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Footer */}
      <footer 
        className="h-20 px-6 md:px-16 flex flex-col md:flex-row items-center justify-between border-t border-border-custom text-[11px] text-text-dim gap-4 py-6 md:py-0 relative"
        style={{ backgroundColor: `${themeSettings.backgroundColor}E6` }}
      >
        <div>© 2024 {userName.toUpperCase()} PORTFOLIO. ALL RIGHTS RESERVED.</div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span>LOCATED IN SHANGHAI, CHINA</span>
          </div>
          <div className="flex items-center gap-2 text-text-main cursor-pointer hover:text-accent transition-colors">
            <span>RESUME.PDF</span>
            <ExternalLink size={12} />
          </div>
        </div>
      </footer>
    </ErrorBoundary>
  );
}
