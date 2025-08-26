const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'mathify-b05be'
  });
}

const db = admin.firestore();

async function createGradeStructure() {
  try {
    const grades = ['8', '9', '10', '11', '12'];
    
    for (const gradeId of grades) {
      console.log(`Creating structure for Grade ${gradeId}...`);
      
      // Create Grade document
      const gradeRef = db.collection('Grades').doc(gradeId);
      await gradeRef.set({
        name: `Grade ${gradeId}`,
        createdAt: admin.firestore.Timestamp.now()
      });
      
      // Create sample Topics for each grade
      const sampleTopics = [
        { id: 'algebra', name: 'Algebra' },
        { id: 'geometry', name: 'Geometry' },
        { id: 'statistics', name: 'Statistics' }
      ];
      
      for (const topic of sampleTopics) {
        const topicRef = gradeRef.collection('Topics').doc(topic.id);
        await topicRef.set({
          name: topic.name,
          createdAt: admin.firestore.Timestamp.now()
        });
        
        // Create sample SubTopics for each topic
        const sampleSubTopics = [
          { id: 'basics', name: 'Basics' },
          { id: 'advanced', name: 'Advanced' }
        ];
        
        for (const subTopic of sampleSubTopics) {
          const subTopicRef = topicRef.collection('SubTopics').doc(subTopic.id);
          await subTopicRef.set({
            name: subTopic.name,
            sections: [
              {
                title: `${topic.name} ${subTopic.name} - Introduction`,
                url: "https://example.com/video1"
              },
              {
                title: `${topic.name} ${subTopic.name} - Practice Problems`,
                url: "https://example.com/video2"
              }
            ],
            createdAt: admin.firestore.Timestamp.now()
          });
        }
      }
      
      console.log(`Grade ${gradeId} structure created successfully`);
    }
    
    console.log('All grade structures created successfully!');
    
  } catch (error) {
    console.error('Error creating grade structure:', error);
  }
}

// Run the function
createGradeStructure()
  .then(() => {
    console.log('Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });